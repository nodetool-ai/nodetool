# nodetool.nodes.nodetool.dataframe

## Append

Append two dataframes along their rows.
Outputs a DataFrame object that is the result of appending DataFrame A and DataFrame B.

**Tags:** row, concat, merge

**Inherits from:** BaseNode

- **dataframe_a**: First DataFrame to be appended. (`DataframeRef`)
- **dataframe_b**: Second DataFrame to be appended. (`DataframeRef`)

## CSVToDataframe

Converts CSV data into a DataFrame.

**Tags:** csv, dataframe

**Inherits from:** BaseNode

- **csv_data**: String input of CSV formatted text. (`str`)

## ColumnToList

Convert a column in a dataframe to a list.

**Tags:** dataframe, column

**Inherits from:** BaseNode

- **dataframe**: The input dataframe. (`DataframeRef`)
- **column_name**: The name of the column to be converted to a list. (`str`)

## Concat

Merge two dataframes along their columns.
Outputs a single DataFrame resulting from the merging of dataframe_a and dataframe_b along their columns.

**Tags:** merge

**Inherits from:** BaseNode

- **dataframe_a**: First DataFrame to be merged. (`DataframeRef`)
- **dataframe_b**: Second DataFrame to be merged. (`DataframeRef`)

## DropDuplicates

Drop duplicate rows from a DataFrame.

**Tags:** duplicate, dataframe, unique

**Inherits from:** BaseNode

- **df**: The input DataFrame. (`DataframeRef`)

## DropNA

Drop NA values from a DataFrame.

**Tags:** na, dataframe, missing

**Inherits from:** BaseNode

- **df**: The input DataFrame. (`DataframeRef`)

## Filter

Filter DataFrame based on a condition.

**Tags:** dataframe, condition, query

**Inherits from:** BaseNode

- **df**: The DataFrame to filter. (`DataframeRef`)
- **condition**: The filtering condition to be applied to the DataFrame, e.g. column_name > 5. (`str`)

## FromTensor

Convert a tensor to a dataframe.

**Tags:** dataframe, tensor

**Inherits from:** BaseNode

- **tensor**: A tensor object to be converted into a dataframe. (`Tensor`)
- **columns**: A list of strings specifying the column names for the resulting dataframe. (`list[str]`)

## IrisDataFrame

Load the Iris dataset.

**Tags:** ml, training, dataset, test, iris

**Inherits from:** BaseNode


## Join

Merges two dataframes along their columns.
Outputs a single DataFrame resulting from the merging of dataframe_a and dataframe_b along their columns.

**Tags:** merge, join

**Inherits from:** BaseNode

- **dataframe_a**: First DataFrame to be merged. (`DataframeRef`)
- **dataframe_b**: Second DataFrame to be merged. (`DataframeRef`)
- **join_on**: The column name on which to join the two dataframes. (`str`)

## ListToColumn

Convert a list of objects into a column in a dataframe.

**Tags:** dataframe, column, values

**Inherits from:** BaseNode

- **dataframe**: Dataframe object to add a new column to. (`DataframeRef`)
- **column_name**: The name of the new column to be added to the dataframe. (`str`)
- **values**: A list of any type of elements which will be the new column's values. (`list[typing.Any]`)

## ListToDataFrame

Convert a list of values to a dataframe. Each row may be a dict, list, or single value.

**Tags:** list, dataframe

**Inherits from:** BaseNode

- **values**: List of values to be converted, each value will be a row. (`list[typing.Any]`)
- **columns**: Comma separated list of column names (`str`)

## Plot

Plots a dataframe as a line, bar, or scatter plot.

**Tags:** plot, dataframe, line, bar, scatter

**Inherits from:** BaseNode

- **dataframe**: The input dataframe. (`DataframeRef`)
- **x_column**: The name of the x column to be used in the plot. (`str`)
- **y_column**: The name of the y column to be used in the plot. (`str`)
- **plot_type**: The type of plot to be created. Can be 'line', 'bar', or 'scatter'. (`PlotType`)

## PlotHeatmap

Plot a heatmap of a dataframe.

**Tags:** heatmap, plot, dataframe

**Inherits from:** BaseNode

- **dataframe**: The input dataframe. (`DataframeRef`)

## PlotHistogram

Plot a histogram of a dataframe column.

**Tags:** histogram, plot, dataframe

**Inherits from:** BaseNode

- **dataframe**: The input dataframe. (`DataframeRef`)
- **column**: The column to plot. (`str`)

## RowsToStrings

Convert rows in a dataframe to strings.

**Tags:** dataframe, columns

**Inherits from:** BaseNode

- **dataframe**: The input dataframe. (`DataframeRef`)
- **template**: The template for the string representation. Each column can be referenced by {column_name}. (`str`)

## SaveDataframe

Save data frame as a CSV file in a folder.

**Tags:** csv, folder

**Inherits from:** BaseNode

- **df** (`DataframeRef`)
- **folder**: Name of the output folder. (`FolderRef`)
- **name**: Name of the output file. (`str`)

## SelectColumn

Select specific columns from a dataframe.

**Tags:** dataframe, columns

**Inherits from:** BaseNode

- **dataframe**: a dataframe from which columns are to be selected (`DataframeRef`)
- **columns**: comma separated list of column names (`str`)

## Sort

Sort a DataFrame by a column.

**Tags:** dataframe, sort, order

**Inherits from:** BaseNode

- **df** (`DataframeRef`)
- **column**: The column to sort the DataFrame by. (`str`)

## ToTensor

Convert a dataframe to a tensor.

**Tags:** dataframe, tensor

**Inherits from:** BaseNode

- **dataframe**: The input dataframe. (`DataframeRef`)

