import chromadb
from chromadb.config import Settings, DEFAULT_DATABASE, DEFAULT_TENANT
from urllib.parse import urlparse
from nodetool.common.environment import Environment


def get_chroma_client(
    user_id: str | None = None, existing_client: "ClientAPI | None" = None
):
    """
    Get a ChromaDB client instance.

    Args:
        user_id (str | None): User ID for tenant creation. Required for remote connections.
        existing_client (ClientAPI | None): Existing ChromaDB client to reuse if provided.

    Returns:
        ClientAPI: ChromaDB client instance
    """
    if existing_client is not None:
        return existing_client

    url = Environment.get_chroma_url()
    token = Environment.get_chroma_token()
    log = Environment.get_logger()

    if url is not None:
        parsed_url = urlparse(url)

        # Only create tenant if user_id is provided
        if user_id:
            admin = chromadb.AdminClient(
                settings=Settings(
                    chroma_api_impl="chromadb.api.fastapi.FastAPI",
                    chroma_client_auth_provider="chromadb.auth.token_authn.TokenAuthClientProvider",
                    chroma_client_auth_credentials=token,
                    chroma_server_host=parsed_url.hostname,
                    chroma_server_http_port=parsed_url.port,
                ),
            )
            tenant = f"tenant_{user_id}"
            try:
                admin.get_tenant(tenant)
            except Exception as e:
                log.info(f"Creating tenant {tenant}")
                admin.create_tenant(tenant)
                log.info(f"Creating database {DEFAULT_DATABASE}")
                admin.create_database(DEFAULT_DATABASE, tenant)

        return chromadb.HttpClient(
            host=parsed_url.hostname,
            port=parsed_url.port,
            settings=Settings(
                chroma_client_auth_provider="chromadb.auth.token_authn.TokenAuthClientProvider",
                chroma_client_auth_credentials=token,
            ),
            tenant=f"tenant_{user_id}" if user_id else DEFAULT_TENANT,
            database=DEFAULT_DATABASE,
        )
    else:
        return chromadb.PersistentClient(
            path=Environment.get_chroma_path(),
            tenant=DEFAULT_TENANT,
            database=DEFAULT_DATABASE,
        )
