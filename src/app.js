const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const fsPromises = require('fs').promises;
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

// Check required environment variables
const requiredEnvVars = ['OPENAI_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    process.exit(1);
}

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize Supabase client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const app = express();
const port = process.env.PORT || 3000;

// Add request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', req.body);
    console.log('Query:', req.query);
    next();
});

// Add body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Temporary debug route for root path
app.post('/', (req, res) => {
    console.log('Root path request received:');
    console.log('Full URL:', req.originalUrl);
    console.log('Body:', req.body);
    
    // If this is a Slack request, redirect it to the correct handler
    if (req.body && req.body.command) {
        console.log('Slack command detected, forwarding to /api/slack/ask');
        req.url = '/api/slack/ask';
        app._router.handle(req, res);
        return;
    }
    
    res.status(404).send('Not Found');
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter function
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only PDF, DOCX, and TXT files are allowed.'));
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Function to chunk text
function chunkText(text) {
    const chunkSize = 1000;
    const overlap = 200;
    const chunks = [];
    let startIndex = 0;

    while (startIndex < text.length) {
        let endIndex = startIndex + chunkSize;
        let chunk = text.slice(startIndex, endIndex);

        // If not at the end, try to break at a sentence
        if (endIndex < text.length) {
            const lastPeriod = chunk.lastIndexOf('.');
            const lastQuestion = chunk.lastIndexOf('?');
            const lastExclamation = chunk.lastIndexOf('!');
            const lastBreak = Math.max(lastPeriod, lastQuestion, lastExclamation);

            if (lastBreak !== -1 && lastBreak > chunkSize - overlap) {
                endIndex = startIndex + lastBreak + 1;
                chunk = text.slice(startIndex, endIndex);
            }
        }

        chunks.push(chunk.trim());
        startIndex = endIndex - overlap;
    }

    return chunks;
}

// Function to parse different file types
async function parseFile(file) {
    const ext = path.extname(file.originalname).toLowerCase();
    let text = '';

    try {
        switch (ext) {
            case '.pdf':
                const pdfData = await fsPromises.readFile(file.path);
                const pdfContent = await pdfParse(pdfData);
                text = pdfContent.text;
                break;

            case '.docx':
                const docxData = await fsPromises.readFile(file.path);
                const docxContent = await mammoth.extractRawText({ buffer: docxData });
                text = docxContent.value;
                break;

            case '.txt':
                text = await fsPromises.readFile(file.path, 'utf-8');
                break;

            default:
                throw new Error('Unsupported file type');
        }

        return text;
    } catch (error) {
        throw new Error(`Error parsing file: ${error.message}`);
    }
}

// Function to get embeddings for chunks
async function getEmbeddings(chunks) {
    try {
        const embeddings = [];
        for (const chunk of chunks) {
            const response = await openai.embeddings.create({
                input: chunk,
                model: "text-embedding-3-small"
            });
            embeddings.push(response.data[0].embedding);
        }
        return embeddings;
    } catch (error) {
        throw new Error(`Error generating embeddings: ${error.message}`);
    }
}

// Function to get embedding for a single text
async function getEmbedding(text) {
    try {
        const response = await openai.embeddings.create({
            input: text,
            model: "text-embedding-3-small"
        });
        return response.data[0].embedding;
    } catch (error) {
        throw new Error(`Error generating embedding: ${error.message}`);
    }
}

// Function to get similar chunks using cosine similarity
async function getSimilarChunks(embedding, limit = 5) {
    try {
        const { data: chunks, error } = await supabase.rpc('match_chunks', {
            query_embedding: embedding,
            match_count: limit
        });

        if (error) throw error;
        return chunks;
    } catch (error) {
        throw new Error(`Error finding similar chunks: ${error.message}`);
    }
}

// Function to generate response using GPT-4
async function generateResponse(question, contexts) {
    try {
        const prompt = `You are an assistant. Answer the question using only the provided context. If you cannot find the answer in the context, say "I don't have enough information to answer this question."

Context:
${contexts.map((ctx, i) => `[${i + 1}] ${ctx.content}`).join('\n\n')}

Question: ${question}

Answer:`;

        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that answers questions based solely on the provided context. If the context doesn't contain the answer, acknowledge that you don't have enough information."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        return response.choices[0].message.content.trim();
    } catch (error) {
        throw new Error(`Error generating GPT response: ${error.message}`);
    }
}

// Handle file upload and processing
app.post('/api/upload', upload.single('file'), async (req, res) => {
    console.log('Upload request received. req.file:', req.file);
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        // Parse the file
        const text = await parseFile(req.file);
        
        // Split text into chunks
        const chunks = chunkText(text);
        
        // Generate embeddings
        const embeddings = await getEmbeddings(chunks);

        // Insert document into Supabase
        const { data: document, error: documentError } = await supabase
            .from('documents')
            .insert({
                filename: req.file.filename,
                original_name: req.file.originalname,
                upload_date: new Date().toISOString()
            })
            .select()
            .single();

        if (documentError) throw new Error(`Error inserting document: ${documentError.message}`);

        // Insert chunks with embeddings
        const chunksToInsert = chunks.map((content, index) => ({
            document_id: document.id,
            chunk_index: index,
            content: content,
            embedding: embeddings[index]
        }));

        const { error: chunksError } = await supabase
            .from('chunks')
            .insert(chunksToInsert);

        if (chunksError) throw new Error(`Error inserting chunks: ${chunksError.message}`);

        // Clean up uploaded file
        await fsPromises.unlink(req.file.path);

        res.json({
            message: 'File processed and stored successfully',
            document: {
                id: document.id,
                filename: document.filename,
                original_name: document.original_name,
                upload_date: document.upload_date
            },
            chunks_count: chunks.length
        });

    } catch (error) {
        // Clean up uploaded file in case of error
        if (req.file) {
            await fsPromises.unlink(req.file.path).catch(console.error);
        }
        res.status(500).json({ error: error.message });
    }
});

// Question answering endpoint
app.post('/api/ask', async (req, res) => {
    try {
        const { question } = req.body;

        if (!question) {
            return res.status(400).json({ error: 'Question is required' });
        }

        // Get embedding for the question
        const questionEmbedding = await getEmbedding(question);

        // Find similar chunks
        const similarChunks = await getSimilarChunks(questionEmbedding);

        if (!similarChunks || similarChunks.length === 0) {
            return res.json({
                answer: "I don't have any relevant information to answer this question.",
                chunks: []
            });
        }

        // Generate response using GPT-4
        const answer = await generateResponse(question, similarChunks);

        res.json({
            answer,
            chunks: similarChunks.map(chunk => ({
                content: chunk.content,
                similarity: chunk.similarity
            }))
        });

    } catch (error) {
        console.error('Error processing question:', error);
        res.status(500).json({ error: error.message });
    }
});

// Slack slash command endpoint
app.post('/api/slack/ask', express.urlencoded({ extended: true }), async (req, res) => {
    try {
        // Extract the text from the Slack slash command payload
        const { text } = req.body;

        if (!text) {
            return res.send({
                response_type: 'ephemeral',
                text: 'Please provide a question after the slash command.'
            });
        }

        // Get embedding for the question
        const questionEmbedding = await getEmbedding(text);

        // Find similar chunks
        const similarChunks = await getSimilarChunks(questionEmbedding);

        if (!similarChunks || similarChunks.length === 0) {
            return res.send({
                response_type: 'in_channel',
                text: "I don't have any relevant information to answer this question."
            });
        }

        // Generate response using GPT-4
        const answer = await generateResponse(text, similarChunks);

        // Format response for Slack
        res.send({
            response_type: 'in_channel',
            text: answer
        });

    } catch (error) {
        console.error('Error processing Slack question:', error);
        res.send({
            response_type: 'ephemeral',
            text: `Error: ${error.message}`
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File size too large. Maximum size is 5MB.' });
        }
        return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
});

// Add catch-all route at the end to log unmatched routes
app.use((req, res) => {
    console.log(`[${new Date().toISOString()}] No route matched: ${req.method} ${req.path}`);
    res.status(404).send('Not Found');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
}); 