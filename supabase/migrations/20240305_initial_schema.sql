-- Enable the pgvector extension to work with embeddings
create extension if not exists "vector";

-- Create documents table
create table if not exists "documents" (
    "id" uuid default gen_random_uuid() primary key,
    "filename" text not null,
    "original_name" text not null,
    "upload_date" timestamp with time zone default timezone('utc'::text, now()) not null,
    -- Add created_at and updated_at columns (Supabase convention)
    "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
    "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create chunks table with vector support
create table if not exists "chunks" (
    "id" uuid default gen_random_uuid() primary key,
    "document_id" uuid references documents(id) on delete cascade not null,
    "chunk_index" integer not null,
    "content" text not null,
    "embedding" vector(1536) not null,
    -- Add created_at and updated_at columns (Supabase convention)
    "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
    "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
    -- Add a unique constraint to prevent duplicate chunks for the same document
    unique("document_id", "chunk_index")
);

-- Create an index on the embedding column for faster similarity searches
create index on chunks using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- Function to automatically update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc'::text, now());
    return new;
end;
$$;

-- Create triggers to automatically update updated_at
create trigger update_documents_updated_at
    before update on documents
    for each row
    execute function update_updated_at_column();

create trigger update_chunks_updated_at
    before update on chunks
    for each row
    execute function update_updated_at_column();

-- Add RLS (Row Level Security) policies
alter table documents enable row level security;
alter table chunks enable row level security;

-- Create a policy that allows all operations for authenticated users
create policy "Allow all operations for authenticated users" on documents
    for all
    to authenticated
    using (true)
    with check (true);

create policy "Allow all operations for authenticated users" on chunks
    for all
    to authenticated
    using (true)
    with check (true); 