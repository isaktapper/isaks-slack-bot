-- Create a function to match chunks by embedding similarity
create or replace function match_chunks(
    query_embedding vector(1536),
    match_count int default 5
)
returns table (
    id uuid,
    content text,
    document_id uuid,
    chunk_index int,
    similarity float
)
language plpgsql
as $$
begin
    return query
    select
        chunks.id,
        chunks.content,
        chunks.document_id,
        chunks.chunk_index,
        1 - (chunks.embedding <=> query_embedding) as similarity
    from chunks
    order by chunks.embedding <=> query_embedding
    limit match_count;
end;
$$; 