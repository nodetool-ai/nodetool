/**
 * Lightweight collection index route handler.
 *
 * Provides a typed handler function (not framework-specific) for indexing
 * files into a named collection.
 */

/** Function that indexes a file into a collection, returning an error string or null. */
export type IndexFileToCollectionFn = (
  collectionName: string,
  filePath: string,
  mimeType: string,
  token: string
) => Promise<string | null>;

/** Result returned by the index handler. */
export interface IndexResult {
  path: string;
  error: string | null;
}

/** Error type for HTTP-like error responses. */
export interface CollectionHttpError {
  statusCode: number;
  detail: string;
}

/**
 * Handle a file index request for a collection.
 *
 * This is a framework-agnostic handler. The caller is responsible for:
 * - Extracting the collection name from the URL
 * - Saving the uploaded file to a temporary path
 * - Passing the authorization header value
 * - Cleaning up the temporary file after the handler returns
 *
 * @param collectionName - Target collection name
 * @param filePath - Path to the temporary uploaded file on disk
 * @param fileName - Original file name from the upload
 * @param mimeType - MIME type of the uploaded file
 * @param authorization - Authorization header value (defaults to "local_token")
 * @param indexFn - The actual indexing function to call
 * @returns IndexResult on success, or throws an CollectionHttpError
 */
export async function handleCollectionIndex(
  collectionName: string,
  filePath: string,
  fileName: string,
  mimeType: string,
  authorization: string | undefined,
  indexFn: IndexFileToCollectionFn
): Promise<IndexResult> {
  const token = authorization || "local_token";

  try {
    const error = await indexFn(collectionName, filePath, mimeType, token);
    if (error) {
      return { path: fileName || "unknown", error };
    }
    return { path: fileName || "unknown", error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`Error indexing file ${fileName}: ${message}`);
    const httpError: CollectionHttpError = {
      statusCode: 500,
      detail: message
    };
    throw httpError;
  }
}
