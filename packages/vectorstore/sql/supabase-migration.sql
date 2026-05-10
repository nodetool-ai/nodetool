-- NodeTool vector store — Supabase / pgvector migration
--
-- Run once against your Supabase project (SQL editor, supabase migration,
-- or psql). The provider (`@nodetool-ai/vectorstore` SupabaseProvider) talks
-- to PostgREST and the `nodetool_vec_match` RPC defined here — it does NOT
-- run DDL itself.
--
-- Layout: two shared tables — a registry and a records table — plus one
-- RPC for similarity search. PostgREST cannot use pgvector operators
-- directly (`<=>` / `<->` / `<#>`), so vector search is wrapped in a
-- function callable via `supabase.rpc('nodetool_vec_match', {...})`.

create extension if not exists vector;

-- Registry: one row per collection.
create table if not exists public.nodetool_vec_collections (
  name        text primary key,
  metadata    jsonb       not null default '{}'::jsonb,
  dimension   int,
  metric      text        not null default 'cosine'
                check (metric in ('cosine', 'l2', 'ip')),
  created_at  timestamptz not null default now()
);

-- Records: shared table, partitioned logically by `collection`. Rows cascade
-- on rename/delete of the parent collection so the provider can rename
-- collections without rewriting every record.
create table if not exists public.nodetool_vec_records (
  collection  text not null
              references public.nodetool_vec_collections(name)
              on update cascade on delete cascade,
  id          text  not null,
  document    text,
  embedding   vector,
  uri         text,
  metadata    jsonb not null default '{}'::jsonb,
  primary key (collection, id)
);

create index if not exists nodetool_vec_records_collection_idx
  on public.nodetool_vec_records (collection);

-- Optional: once your collection has a fixed dimension, create an ivfflat
-- index for fast approximate search. Cosine example for dimension 1536:
--
--   alter table public.nodetool_vec_records
--     alter column embedding type vector(1536) using embedding::vector(1536);
--   create index on public.nodetool_vec_records
--     using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Similarity-search RPC. Distance operator is selected from the
-- collection's `metric` column. `p_metadata_filter` is applied as jsonb
-- containment (`@>`) — pass `{"k": "v"}` to require records whose
-- metadata contains that key/value. `p_document_match`, when non-null,
-- filters by case-insensitive substring match on the document column.
create or replace function public.nodetool_vec_match(
  p_collection      text,
  p_query_embedding vector,
  p_match_count     int     default 10,
  p_metadata_filter jsonb   default '{}'::jsonb,
  p_document_match  text    default null
)
returns table (
  id        text,
  document  text,
  uri       text,
  metadata  jsonb,
  distance  float8
)
language plpgsql
stable
as $$
declare
  metric_name text;
begin
  select c.metric into metric_name
    from public.nodetool_vec_collections c
   where c.name = p_collection;

  if metric_name is null then
    raise exception 'Collection % not found', p_collection
      using errcode = 'P0002';
  end if;

  return query
    select r.id, r.document, r.uri, r.metadata,
           case metric_name
             when 'l2' then (r.embedding <-> p_query_embedding)::float8
             when 'ip' then (r.embedding <#> p_query_embedding)::float8
             else           (r.embedding <=> p_query_embedding)::float8
           end as distance
      from public.nodetool_vec_records r
     where r.collection = p_collection
       and r.metadata @> p_metadata_filter
       and (p_document_match is null
            or r.document ilike '%' || p_document_match || '%')
     order by case metric_name
                when 'l2' then (r.embedding <-> p_query_embedding)
                when 'ip' then (r.embedding <#> p_query_embedding)
                else           (r.embedding <=> p_query_embedding)
              end
     limit p_match_count;
end;
$$;
