# nodetool.nodes.nodetool.dataframe

## AddColumn

Add list of values as new column to dataframe.

Use cases:
- Incorporate external data into existing dataframe
- Add calculated results as new column
- Augment dataframe with additional features

## Chart

Create line, bar, or scatter plot from dataframe.

Use cases:
- Visualize trends in time series data
- Compare values across categories
- Explore relationships between variables

## CombineVertically

Append two dataframes along rows.

Use cases:
- Combine data from multiple time periods
- Merge datasets with same structure
- Aggregate data from different sources

## ConvertToTensor

Convert dataframe to tensor.

Use cases:
- Prepare data for deep learning models
- Enable tensor operations on dataframe data
- Convert tabular data to multidimensional format

## ExtractColumn

Convert dataframe column to list.

Use cases:
- Extract data for use in other processing steps
- Prepare column data for plotting or analysis
- Convert categorical data to list for encoding

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

## FormatAsText

Convert dataframe rows to formatted strings.

Use cases:
- Generate text summaries from row data
- Prepare data for natural language processing
- Create custom string representations of rows

## FromList

Convert list of dicts to dataframe.

Use cases:
- Transform list data into structured dataframe
- Prepare list data for analysis or visualization
- Convert API responses to dataframe format

## FromTensor

Convert tensor to dataframe.

Use cases:
- Analyze tensor data using pandas functions
- Visualize tensor data in tabular format
- Export tensor results to dataframe structure

## Heatmap

Create heatmap visualization of dataframe.

Use cases:
- Visualize correlation between variables
- Identify patterns in multi-dimensional data
- Display intensity of values across categories

## Histogram

Plot histogram of dataframe column.

Use cases:
- Visualize distribution of continuous data
- Identify outliers and data patterns
- Compare data distributions across categories

## ImportCSV

Convert CSV string to dataframe.

Use cases:
- Import CSV data from string input
- Convert CSV responses from APIs to dataframe

## Join

Join two dataframes on specified column.

Use cases:
- Combine data from related tables
- Enrich dataset with additional information
- Link data based on common identifiers

## LoadIrisDataset

Load Iris dataset as dataframe.

Use cases:
- Practice machine learning techniques
- Benchmark classification algorithms
- Demonstrate data analysis workflows

## MergeSideBySide

Merge two dataframes along columns.

Use cases:
- Combine data from multiple sources
- Add new features to existing dataframe
- Merge time series data from different periods

## RemoveDuplicates

Remove duplicate rows from dataframe.

Use cases:
- Clean dataset by removing redundant entries
- Ensure data integrity in analysis
- Prepare data for unique value operations

## RemoveIncompleteRows

Remove rows with NA values from dataframe.

Use cases:
- Clean dataset by removing incomplete entries
- Prepare data for analysis requiring complete cases
- Improve data quality for modeling

## SaveDataframe

Save dataframe in specified folder.

Use cases:
- Export processed data for external use
- Create backups of dataframes

## SelectColumn

Select specific columns from dataframe.

Use cases:
- Extract relevant features for analysis
- Reduce dataframe size by removing unnecessary columns
- Prepare data for specific visualizations or models

## SortByColumn

Sort dataframe by specified column.

Use cases:
- Arrange data in ascending or descending order
- Identify top or bottom values in dataset
- Prepare data for rank-based analysis

