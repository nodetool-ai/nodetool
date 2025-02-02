# nodetool.nodes.lib.file.excel

## AutoFitColumns

Automatically adjusts column widths to fit content.

Use cases:
- Improve spreadsheet readability
- Professional presentation

**Tags:** excel, format, columns

**Fields:**
- **workbook**: The Excel workbook to format (ExcelRef)
- **sheet_name**: Target worksheet name (str)


## CreateWorkbook

Creates a new Excel workbook.

Use cases:
- Initialize new Excel files
- Start spreadsheet creation workflows

**Tags:** excel, workbook, create

**Fields:**
- **sheet_name**: Name for the first worksheet (str)


## DataFrameToExcel

Writes a DataFrame to an Excel worksheet.

Use cases:
- Export data analysis results
- Create reports from data

**Tags:** excel, dataframe, export

**Fields:**
- **workbook**: The Excel workbook to write to (ExcelRef)
- **dataframe**: DataFrame to write (DataframeRef)
- **sheet_name**: Target worksheet name (str)
- **start_cell**: Starting cell for data (str)
- **include_header**: Include column headers (bool)


## ExcelToDataFrame

Reads an Excel worksheet into a pandas DataFrame.

Use cases:
- Import Excel data for analysis
- Process spreadsheet contents

**Tags:** excel, dataframe, import

**Fields:**
- **workbook**: The Excel workbook to read from (ExcelRef)
- **sheet_name**: Source worksheet name (str)
- **has_header**: First row contains headers (bool)


## FormatCells

Applies formatting to a range of cells.

Use cases:
- Highlight important data
- Create professional looking reports

**Tags:** excel, format, style

**Fields:**
- **workbook**: The Excel workbook to format (ExcelRef)
- **sheet_name**: Target worksheet name (str)
- **cell_range**: Cell range to format (e.g. 'A1:B10') (str)
- **bold**: Make text bold (bool)
- **background_color**: Background color in hex format (e.g. 'FFFF00' for yellow) (typing.Optional[str])
- **text_color**: Text color in hex format (typing.Optional[str])


## SaveWorkbook

Saves an Excel workbook to disk.

Use cases:
- Export final spreadsheet
- Save work in progress

**Tags:** excel, save, export

**Fields:**
- **workbook**: The Excel workbook to save (ExcelRef)
- **filepath**: 
        Path where to save the file.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
         (FilePath)


