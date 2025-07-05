# AI-Powered Slack Bot

A Slack bot that uses OpenAI and Supabase to provide document Q&A capabilities through slash commands.

## Features

- File upload and processing (PDF, DOCX, TXT)
- Document chunking and embedding using OpenAI
- Semantic search using Supabase's vector similarity
- Slack slash command integration for asking questions
- GPT-4 powered answers based on document context

## Setup

1. Clone the repository:
```bash
git clone https://github.com/isaktapper/isaks-slack-bot.git
cd isaks-slack-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file with the following variables:
```
OPENAI_API_KEY=your_openai_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Start the server:
```bash
node src/app.js
```

## API Endpoints

- `POST /api/upload` - Upload and process documents
- `POST /api/ask` - Ask questions about uploaded documents
- `POST /api/slack/ask` - Slack slash command endpoint for questions

## Environment Variables

- `OPENAI_API_KEY` - Your OpenAI API key
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `PORT` - Server port (default: 3000)

## Slack Integration

1. Create a new Slack app
2. Add a slash command (e.g., `/ask`)
3. Set the command URL to `https://your-domain/api/slack/ask`
4. Install the app to your workspace

## License

MIT 