-- Get the arguments passed to the script
on run argv
    -- Reading environment variables for root directory and note limits from arguments
    set envRootDir to item 1 of argv
    set envNoteLimit to item 2 of argv
    set envNoteLimitPerFolder to item 3 of argv
    set envFilenameFormat to item 4 of argv
    set envSubdirFormat to item 5 of argv
    set envUseSubdirs to item 6 of argv

    -- Convert envRootDir to an absolute path if necessary - avoid CFURLGetFSRef was passed a URL which has no scheme warning
    if envRootDir starts with "./" then
        set currentDirectory to (do shell script "pwd")
        set envRootDir to currentDirectory & (text 2 through -1 of envRootDir)
    end if

    -- Ensure envRootDir ends with a "/"
    if envRootDir does not end with "/" then
        set envRootDir to envRootDir & "/"
    end if

    -- Log the final envRootDir
    log "Final envRootDir: " & envRootDir

    if envNoteLimit is equal to "" then
        set noteLimit to -1
    else
        set noteLimit to envNoteLimit as number
    end if

    if envNoteLimitPerFolder is equal to "" then
        set noteLimitPerFolder to -1
    else
        set noteLimitPerFolder to envNoteLimitPerFolder as number
    end if

    set htmlDirectory to envRootDir & "html/"
    set textDirectory to envRootDir & "text/"

    -- Create main directories
    my createDirectory(htmlDirectory)
    my createDirectory(textDirectory)

    -- Log the directories being created
    log "htmlDirectory: " & htmlDirectory
    log "textDirectory: " & textDirectory

    -- Variables for statistics
    set totalNotesOutput to 0
    set totalNotesOverall to 0
    set folderStatistics to {}

    tell application "Notes"
        set theAccounts to every account
        repeat with anAccount in theAccounts
            set accountName to my makeValidFilename(name of anAccount)
            set accountID to my extractAccountID(id of anAccount)
            set shortAccountID to my extractShortAccountID(accountID)
            set theFolders to every folder of anAccount
            repeat with aFolder in theFolders
                set folderName to my makeValidFilename(name of aFolder)
                
                -- Determine subdirectory name or root directory based on useSubdirs flag
                if envUseSubdirs is "true" then
                    set subdirName to my generateFilename(envSubdirFormat, "", "", accountName, folderName, accountID, shortAccountID)
                    set folderHTMLPath to htmlDirectory & subdirName & "/"
                    set folderTextPath to textDirectory & subdirName & "/"
                    my createDirectory(folderHTMLPath)
                    my createDirectory(folderTextPath)
                else
                    set folderHTMLPath to htmlDirectory
                    set folderTextPath to textDirectory
                end if

                set theNotes to notes of aFolder
                set folderNoteCount to 0
                set outputNoteCount to 0

                if envUseSubdirs is "true" then
                    log "Notebook: " & (subdirName)
                else
                    log "Notebook: " & (folderName)
                end if

                repeat with theNote in theNotes
                    set totalNotesOverall to totalNotesOverall + 1
                    if (noteLimit ≠ -1 and totalNotesOutput > noteLimit) or (noteLimitPerFolder ≠ -1 and folderNoteCount ≥ noteLimitPerFolder) then exit repeat
                    set folderNoteCount to folderNoteCount + 1
                    set totalNotesOutput to totalNotesOutput + 1
                    set outputNoteCount to outputNoteCount + 1

                    log "- Note: " & (name of theNote)

                    set noteTitle to my makeValidFilename(name of theNote)
                    set noteID to my extractID(id of theNote)

                    -- Generate filename using the specified format
                    set noteName to my generateFilename(envFilenameFormat, noteTitle, noteID, accountName, folderName, accountID, shortAccountID)

                    set noteHTMLPath to POSIX path of (folderHTMLPath & noteName & ".html")
                    set noteTextPath to POSIX path of (folderTextPath & noteName & ".txt")

                    -- Save HTML content
                    set htmlContent to body of theNote

                    my writeToFile(noteHTMLPath, htmlContent)

                    -- Save text content
                    set textContent to plaintext of theNote
                    my writeToFile(noteTextPath, textContent)
                end repeat

                set end of folderStatistics to {folderName:folderName, totalNotes:count of theNotes, notesOutput:outputNoteCount}
            end repeat
        end repeat
    end tell

    -- Output statistics
    log "Folders Parsed: " & (count of folderStatistics)
    log "Total Notes Output: " & totalNotesOutput
    log "Total Notes Overall: " & totalNotesOverall
    repeat with stat in folderStatistics
        log "Folder: " & (folderName of stat) & ", Total Notes: " & (totalNotes of stat) & ", Notes Output: " & (notesOutput of stat)
    end repeat

end run

-- Subroutine to create a directory if it doesn't exist
on createDirectory(directoryPath)
    do shell script "mkdir -p " & quoted form of directoryPath
end createDirectory

-- Subroutine to write content to a file
on writeToFile(filePath, content)
    try
        -- Convert the file path to a file object
        set fileObject to POSIX file filePath
        -- Try to open the file for access
        set fileDescriptor to open for access fileObject with write permission
        write content to fileDescriptor starting at eof
        close access fileDescriptor
    on error errMsg
        -- Log the error message
        log "Error writing to file: " & errMsg

        -- If the file does not exist, create it and then open for access
        close access
        do shell script "touch " & quoted form of filePath
        set fileDescriptor to open for access fileObject with write permission
        write content to fileDescriptor starting at eof
        close access fileDescriptor
    end try
end writeToFile

-- Subroutine to generate a valid filename, replace certain characters with dashes, remove non-alphanumeric characters (except dashes), and consolidate multiple dashes
on makeValidFilename(fileName)
    -- Replace slashes, underscores, and spaces with dashes
    set charactersToReplace to {"/", "_", " ", ".", ","}
    repeat with aChar in charactersToReplace
        set AppleScript's text item delimiters to aChar
        set fileName to text items of fileName
        set AppleScript's text item delimiters to "-"
        set fileName to fileName as string
    end repeat

    -- Remove all characters that are not alphanumeric or dashes
    set validFileName to ""
    repeat with i from 1 to length of fileName
        set currentChar to character i of fileName
        if currentChar is in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-" then
            set validFileName to validFileName & currentChar
        end if
    end repeat

    -- Consolidate multiple dashes into a single dash
    set AppleScript's text item delimiters to "--"
    set textItems to text items of validFileName
    set AppleScript's text item delimiters to "-"
    set validFileName to textItems as string

    -- Check and replace again if necessary
    repeat while validFileName contains "--"
        set AppleScript's text item delimiters to "--"
        set textItems to text items of validFileName
        set AppleScript's text item delimiters to "-"
        set validFileName to textItems as string
    end repeat

    -- Remove trailing dash if present
    if validFileName ends with "-" then
        set validFileName to text 1 through -2 of validFileName
    end if

    return validFileName
end makeValidFilename

-- Subroutine to generate a filename based on the specified format
on generateFilename(format, title, id, account, folder, accountID, shortAccountID)
    set formattedFilename to format
    set formattedFilename to my replaceText("&title", title, formattedFilename)
    set formattedFilename to my replaceText("&id", id, formattedFilename)
    set formattedFilename to my replaceText("&account", account, formattedFilename)
    set formattedFilename to my replaceText("&folder", folder, formattedFilename)
    set formattedFilename to my replaceText("&accountid", accountID, formattedFilename)
    set formattedFilename to my replaceText("&shortaccountid", shortAccountID, formattedFilename)
    return formattedFilename
end generateFilename

-- Subroutine to replace occurrences of a substring within a string
on replaceText(find, replace, subject)
    set AppleScript's text item delimiters to find
    set subject to text items of subject
    set AppleScript's text item delimiters to replace
    set subject to subject as string
    set AppleScript's text item delimiters to ""
    return subject
end replaceText

-- Subroutine to extract the portion of the ID
on extractID(fullID)
    set AppleScript's text item delimiters to "/"
    set idComponents to text items of fullID
    set extractedID to item 5 of idComponents -- The ID is the fifth component
    if extractedID starts with "p" then
        set extractedID to text 2 through -1 of extractedID
    end if
    set AppleScript's text item delimiters to ""
    return extractedID
end extractID

-- Subroutine to extract the account ID
on extractAccountID(fullID)
    set AppleScript's text item delimiters to "/"
    set idComponents to text items of fullID
    set accountID to item 3 of idComponents -- The account ID is the third component
    set AppleScript's text item delimiters to ""
    return accountID
end extractAccountID

-- Subroutine to extract the short account ID
on extractShortAccountID(accountID)
    set AppleScript's text item delimiters to "-"
    set idComponents to text items of accountID
    set shortAccountID to item 5 of idComponents -- The short account ID is the fifth component
    set AppleScript's text item delimiters to ""
    return shortAccountID
end extractShortAccountID