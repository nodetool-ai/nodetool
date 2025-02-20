from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class LoadBostonDataset(GraphNode):
    """
    Loads the Boston Housing dataset.
    dataset, machine learning, regression, housing

    Use cases:
    - House price prediction
    - Regression analysis practice
    """


    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.datasets.LoadBostonDataset"



class LoadBostonDatasetDF(GraphNode):
    """
    Loads the Boston Housing dataset as a dataframe.
    dataset, machine learning, regression, housing

    Use cases:
    - House price prediction
    - Regression analysis practice
    """


    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.datasets.LoadBostonDatasetDF"



class LoadBreastCancerDataset(GraphNode):
    """
    Loads the Breast Cancer Wisconsin dataset.
    dataset, machine learning, classification, medical

    Use cases:
    - Binary classification practice
    - Medical data analysis
    """


    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.datasets.LoadBreastCancerDataset"



class LoadBreastCancerDatasetDF(GraphNode):
    """
    Loads the Breast Cancer Wisconsin dataset as a dataframe.
    dataset, machine learning, classification, medical

    Use cases:
    - Binary classification practice
    - Medical data analysis
    """


    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.datasets.LoadBreastCancerDatasetDF"



class LoadDiabetesDataset(GraphNode):
    """
    Loads the Diabetes dataset for regression.
    dataset, machine learning, regression, medical

    Use cases:
    - Regression analysis practice
    - Medical outcome prediction
    """


    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.datasets.LoadDiabetesDataset"



class LoadDiabetesDatasetDF(GraphNode):
    """
    Loads the Diabetes dataset for regression as a dataframe.
    dataset, machine learning, regression, medical

    Use cases:
    - Regression analysis practice
    - Medical outcome prediction
    """


    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.datasets.LoadDiabetesDatasetDF"



class LoadDigitsDataset(GraphNode):
    """
    Loads the Digits dataset (handwritten digits).
    dataset, machine learning, classification, image

    Use cases:
    - Digit recognition practice
    - Image classification basics
    """


    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.datasets.LoadDigitsDataset"



class LoadIrisDataset(GraphNode):
    """
    Loads the classic Iris flower dataset.
    dataset, machine learning, classification

    Use cases:
    - Practice classification tasks
    - Learn machine learning basics
    """


    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.datasets.LoadIrisDataset"



class LoadIrisDatasetDF(GraphNode):
    """
    Loads the classic Iris flower dataset as a dataframe.
    dataset, machine learning, classification

    Use cases:
    - Practice classification tasks
    - Learn machine learning basics
    """


    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.datasets.LoadIrisDatasetDF"



class MakeBlobsDataset(GraphNode):
    """
    Generates isotropic Gaussian blobs for clustering.
    dataset, machine learning, clustering, synthetic

    Use cases:
    - Testing clustering algorithms
    - Visualizing cluster separation
    """

    n_samples: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of samples to generate')
    n_features: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Number of features')
    centers: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Number of centers/clusters')
    cluster_std: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Standard deviation of clusters')
    random_state: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random state for reproducibility')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.datasets.MakeBlobsDataset"



class MakeBlobsDatasetDF(GraphNode):
    """
    Generates isotropic Gaussian blobs for clustering as a dataframe.
    dataset, machine learning, clustering, synthetic

    Use cases:
    - Testing clustering algorithms
    - Visualizing cluster separation
    """

    n_samples: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of samples to generate')
    n_features: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Number of features')
    centers: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Number of centers/clusters')
    cluster_std: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Standard deviation of clusters')
    random_state: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random state for reproducibility')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.datasets.MakeBlobsDatasetDF"



class MakeCirclesDataset(GraphNode):
    """
    Generates a large circle containing a smaller circle.
    dataset, machine learning, classification, synthetic

    Use cases:
    - Testing nonlinear classification
    - Demonstrating circular decision boundaries
    """

    n_samples: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of samples to generate')
    noise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Standard deviation of gaussian noise')
    factor: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Scale factor between inner and outer circle')
    random_state: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random state for reproducibility')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.datasets.MakeCirclesDataset"



class MakeCirclesDatasetDF(GraphNode):
    """
    Generates a large circle containing a smaller circle as a dataframe.
    dataset, machine learning, classification, synthetic

    Use cases:
    - Testing nonlinear classification
    - Demonstrating circular decision boundaries
    """

    n_samples: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of samples to generate')
    noise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Standard deviation of gaussian noise')
    factor: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Scale factor between inner and outer circle')
    random_state: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random state for reproducibility')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.datasets.MakeCirclesDatasetDF"



class MakeClassificationDataset(GraphNode):
    """
    Generates a random n-class classification problem.
    dataset, machine learning, classification, synthetic

    Use cases:
    - Testing classification algorithms
    - Generating controlled test data
    """

    n_samples: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of samples to generate')
    n_features: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of features')
    n_classes: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Number of classes')
    n_informative: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Number of informative features')
    n_redundant: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Number of redundant features')
    random_state: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random state for reproducibility')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.datasets.MakeClassificationDataset"



class MakeClassificationDatasetDF(GraphNode):
    """
    Generates a random n-class classification problem as a dataframe.
    dataset, machine learning, classification, synthetic

    Use cases:
    - Testing classification algorithms
    - Generating controlled test data
    """

    n_samples: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of samples to generate')
    n_features: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of features')
    n_classes: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Number of classes')
    n_informative: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Number of informative features')
    n_redundant: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Number of redundant features')
    random_state: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random state for reproducibility')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.datasets.MakeClassificationDatasetDF"



class MakeMoonsDataset(GraphNode):
    """
    Generates two interleaving half circles.
    dataset, machine learning, classification, synthetic

    Use cases:
    - Testing nonlinear classification
    - Demonstrating decision boundaries
    """

    n_samples: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of samples to generate')
    noise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Standard deviation of gaussian noise')
    random_state: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random state for reproducibility')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.datasets.MakeMoonsDataset"



class MakeMoonsDatasetDF(GraphNode):
    """
    Generates two interleaving half circles as a dataframe.
    dataset, machine learning, classification, synthetic

    Use cases:
    - Testing nonlinear classification
    - Demonstrating decision boundaries
    """

    n_samples: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of samples to generate')
    noise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Standard deviation of gaussian noise')
    random_state: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random state for reproducibility')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.datasets.MakeMoonsDatasetDF"



class MakeRegressionDataset(GraphNode):
    """
    Generates a random regression problem.
    dataset, machine learning, regression, synthetic

    Use cases:
    - Testing regression algorithms
    - Generating controlled test data
    """

    n_samples: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of samples to generate')
    n_features: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of features')
    n_informative: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='Number of informative features')
    noise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Standard deviation of gaussian noise')
    random_state: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random state for reproducibility')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.datasets.MakeRegressionDataset"



class MakeRegressionDatasetDF(GraphNode):
    """
    Generates a random regression problem as a dataframe.
    dataset, machine learning, regression, synthetic

    Use cases:
    - Testing regression algorithms
    - Generating controlled test data
    """

    n_samples: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of samples to generate')
    n_features: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Number of features')
    n_informative: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='Number of informative features')
    noise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Standard deviation of gaussian noise')
    random_state: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random state for reproducibility')

    @classmethod
    def get_node_type(cls): return "lib.ml.sklearn.datasets.MakeRegressionDatasetDF"


