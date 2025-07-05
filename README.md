# File Upload, Parse, and Embed API

A simple Express.js API that handles file uploads, text extraction, and text embeddings for PDF, DOCX, and TXT files.

## Features

- File upload endpoint at `/api/upload`
- Supports .pdf, .docx, and .txt files
- Automatic text extraction from uploaded files
- Text chunking with configurable size and overlap
- Text embeddings using OpenAI's text-embedding-3-small model
- File size limit: 5MB
- Temporary storage in local `uploads/` folder
- Unique filename generation to prevent conflicts

## Setup

1. Create a `.env` file in the root directory with your OpenAI API key:
```
OPENAI_API_KEY=your_api_key_here
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The server will start on port 3000 by default. You can change this by setting the `PORT` environment variable.

## API Usage

### Upload, Parse, and Embed File

**Endpoint:** POST `/api/upload`

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Field name: `file`
- Supported file types: .pdf, .docx, .txt
- Maximum file size: 5MB

**Example using curl:**
```bash
curl -X POST -F "file=@/path/to/your/file.pdf" http://localhost:3000/api/upload
```

**Success Response:**
```json
{
    "message": "File uploaded, parsed, and embedded successfully",
    "file": {
        "filename": "file-1234567890-123456789.pdf",
        "originalName": "example.pdf",
        "size": 1234567,
        "path": "uploads/file-1234567890-123456789.pdf"
    },
    "chunks": [
        {
            "chunk": "Text content of the first chunk...",
            "embedding": [0.123, -0.456, ...]
        },
        {
            "chunk": "Text content of the second chunk...",
            "embedding": [-0.789, 0.012, ...]
        }
    ]
}
```

**Error Responses:**
- 400: Invalid file type or no file uploaded
- 413: File too large
- 500: Server error (including parsing or embedding errors)

## Processing Details

The API processes files in the following steps:

1. **File Parsing:**
   - PDF files: Uses pdf-parse to extract text content
   - DOCX files: Uses mammoth to extract raw text
   - TXT files: Reads the file directly as UTF-8 text

2. **Text Chunking:**
   - Splits text into ~1000 character chunks
   - Includes 200 character overlap between chunks
   - Attempts to break at natural sentence boundaries
   - Preserves word boundaries

3. **Text Embedding:**
   - Uses OpenAI's text-embedding-3-small model
   - Generates embeddings for each text chunk
   - Returns both chunks and their embeddings in the response 