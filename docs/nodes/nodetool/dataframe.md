# nodetool.nodes.nodetool.dataframe

## AddColumn

Add list of values as new column to dataframe.

Use cases:
- Incorporate external data into existing dataframe
- Add calculated results as new column
- Augment dataframe with additional features

**Tags:** dataframe, column, list

**Fields:**
- **dataframe**: Dataframe object to add a new column to. (DataframeRef)
- **column_name**: The name of the new column to be added to the dataframe. (str)
- **values**: A list of any type of elements which will be the new column's values. (list[typing.Any])


## Chart

Create line, bar, or scatter plot from dataframe.

Use cases:
- Visualize trends in time series data
- Compare values across categories
- Explore relationships between variables

**Tags:** plot, visualization, dataframe

**Fields:**
- **dataframe**: The input dataframe. (DataframeRef)
- **x_column**: The name of the x column to be used in the plot. (str)
- **y_column**: The name of the y column to be used in the plot. (str)
- **plot_type**: The type of plot to be created. Can be 'line', 'bar', or 'scatter'. (PlotType)


## CombineVertically

Append two dataframes along rows.

Use cases:
- Combine data from multiple time periods
- Merge datasets with same structure
- Aggregate data from different sources

**Tags:** append, concat, rows

**Fields:**
- **dataframe_a**: First DataFrame to be appended. (DataframeRef)
- **dataframe_b**: Second DataFrame to be appended. (DataframeRef)


## ConvertToTensor

Convert dataframe to tensor.

Use cases:
- Prepare data for deep learning models
- Enable tensor operations on dataframe data
- Convert tabular data to multidimensional format

**Tags:** dataframe, tensor, convert

**Fields:**
- **dataframe**: The input dataframe. (DataframeRef)


## ExtractColumn

Convert dataframe column to list.

Use cases:
- Extract data for use in other processing steps
- Prepare column data for plotting or analysis
- Convert categorical data to list for encoding

**Tags:** dataframe, column, list

**Fields:**
- **dataframe**: The input dataframe. (DataframeRef)
- **column_name**: The name of the column to be converted to a list. (str)


## Filter

Filter dataframe based on condition.

Example conditions:
age > 30
age > 30 and salary < 50000
name == 'John Doe'
100 <= price <= 200
status in ['Active', 'Pending']
not (age < 18)

Use cases:
- Extract subset of data meeting specific criteria
- Remove outliers or invalid data points
- Focus analysis on relevant data segments

**Tags:** filter, query, condition

**Fields:**
- **df**: The DataFrame to filter. (DataframeRef)
- **condition**: The filtering condition to be applied to the DataFrame, e.g. column_name > 5. (str)


## FindOneRow

Find the first row in a dataframe that matches a given condition.

Example conditions:
age > 30
age > 30 and salary < 50000
name == 'John Doe'
100 <= price <= 200
status in ['Active', 'Pending']
not (age < 18)

Use cases:
- Retrieve specific record based on criteria
- Find first occurrence of a particular condition
- Extract single data point for further analysis

**Tags:** filter, query, condition, single row

**Fields:**
- **df**: The DataFrame to search. (DataframeRef)
- **condition**: The condition to filter the DataFrame, e.g. 'column_name == value'. (str)


## FormatAsText

Convert dataframe rows to formatted strings.

Use cases:
- Generate text summaries from row data
- Prepare data for natural language processing
- Create custom string representations of rows

**Tags:** dataframe, string, format

**Fields:**
- **dataframe**: The input dataframe. (DataframeRef)
- **template**: The template for the string representation. Each column can be referenced by {column_name}. (str)


## FromList

Convert list of dicts to dataframe.

Use cases:
- Transform list data into structured dataframe
- Prepare list data for analysis or visualization
- Convert API responses to dataframe format

**Tags:** list, dataframe, convert

**Fields:**
- **values**: List of values to be converted, each value will be a row. (list[typing.Any])


## Heatmap

Create heatmap visualization of dataframe.

Use cases:
- Visualize correlation between variables
- Identify patterns in multi-dimensional data
- Display intensity of values across categories

**Tags:** heatmap, plot, correlation

**Fields:**
- **dataframe**: The input dataframe. (DataframeRef)


## Histogram

Plot histogram of dataframe column.

Use cases:
- Visualize distribution of continuous data
- Identify outliers and data patterns
- Compare data distributions across categories

**Tags:** histogram, plot, distribution

**Fields:**
- **dataframe**: The input dataframe. (DataframeRef)
- **column**: The column to plot. (str)


## ImportCSV

Convert CSV string to dataframe.

Use cases:
- Import CSV data from string input
- Convert CSV responses from APIs to dataframe

**Tags:** csv, dataframe, import

**Fields:**
- **csv_data**: String input of CSV formatted text. (str)


## Join

Join two dataframes on specified column.

Use cases:
- Combine data from related tables
- Enrich dataset with additional information
- Link data based on common identifiers

**Tags:** join, merge, column

**Fields:**
- **dataframe_a**: First DataFrame to be merged. (DataframeRef)
- **dataframe_b**: Second DataFrame to be merged. (DataframeRef)
- **join_on**: The column name on which to join the two dataframes. (str)


## LoadIrisDataset

Load Iris dataset as dataframe.

Use cases:
- Practice machine learning techniques
- Benchmark classification algorithms
- Demonstrate data analysis workflows

**Tags:** iris, dataset, machine learning

**Fields:**


## MergeSideBySide

Merge two dataframes along columns.

Use cases:
- Combine data from multiple sources
- Add new features to existing dataframe
- Merge time series data from different periods

**Tags:** merge, concat, columns

**Fields:**
- **dataframe_a**: First DataFrame to be merged. (DataframeRef)
- **dataframe_b**: Second DataFrame to be merged. (DataframeRef)


## RemoveDuplicates

Remove duplicate rows from dataframe.

Use cases:
- Clean dataset by removing redundant entries
- Ensure data integrity in analysis
- Prepare data for unique value operations

**Tags:** duplicates, unique, clean

**Fields:**
- **df**: The input DataFrame. (DataframeRef)


## RemoveIncompleteRows

Remove rows with NA values from dataframe.

Use cases:
- Clean dataset by removing incomplete entries
- Prepare data for analysis requiring complete cases
- Improve data quality for modeling

**Tags:** na, missing, clean

**Fields:**
- **df**: The input DataFrame. (DataframeRef)


## SaveDataframe

Save dataframe in specified folder.

Use cases:
- Export processed data for external use
- Create backups of dataframes

**Tags:** csv, folder, save

**Fields:**
- **df** (DataframeRef)
- **folder**: Name of the output folder. (FolderRef)
- **name**: Name of the output file. (str)


## SelectColumn

Select specific columns from dataframe.

Use cases:
- Extract relevant features for analysis
- Reduce dataframe size by removing unnecessary columns
- Prepare data for specific visualizations or models

**Tags:** dataframe, columns, filter

**Fields:**
- **dataframe**: a dataframe from which columns are to be selected (DataframeRef)
- **columns**: comma separated list of column names (str)


## SortByColumn

Sort dataframe by specified column.

Use cases:
- Arrange data in ascending or descending order
- Identify top or bottom values in dataset
- Prepare data for rank-based analysis

**Tags:** sort, order, column

**Fields:**
- **df** (DataframeRef)
- **column**: The column to sort the DataFrame by. (str)


