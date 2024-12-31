# nodetool.nodes.google.drive

## DownloadAudio

Downloads an audio file from Google Drive.

**Fields:**
- **email_address**: Gmail address to connect to (str)
- **file_id**: ID of the file to download (str)


## DownloadDocument

Downloads a Google Document.

**Fields:**
- **email_address**: Gmail address to connect to (str)
- **file_id**: ID of the file to download (str)


## DownloadFile

Downloads files from Google Drive.

**Tags:** google, drive, download

**Fields:**
- **email_address**: Gmail address to connect to (str)
- **file_id**: ID of the file to download (str)

### download

**Args:**
- **context (ProcessingContext)**


## DownloadImage

Downloads an image from Google Drive.

**Fields:**
- **email_address**: Gmail address to connect to (str)
- **file_id**: ID of the file to download (str)


## DownloadVideo

Downloads a video file from Google Drive.

**Fields:**
- **email_address**: Gmail address to connect to (str)
- **file_id**: ID of the file to download (str)


## SearchFiles

Searches for files in Google Drive.

**Tags:** google, drive, search

**Fields:**
- **email_address**: Gmail address to connect to (str)
- **query**: Search query using Google Drive search syntax (e.g., 'name contains 'report' and mimeType = 'application/pdf'') (str)
- **max_results**: Maximum number of files to return (int)


## UploadFile

Uploads files to Google Drive.

**Tags:** google, drive, upload

**Fields:**
- **email_address**: Gmail address to connect to (str)
- **file**: File to upload (AssetRef)
- **parent_folder_id**: ID of the parent folder in Google Drive (root if empty) (str)
- **filename**: Custom filename for the uploaded file (uses local filename if not specified) (typing.Optional[str])


### create_drive_service

Creates an authorized Google Drive service using app password authentication
**Args:**
- **email_address (str)**
- **app_password (str)**

