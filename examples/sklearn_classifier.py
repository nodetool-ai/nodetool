# import asyncio
# from nodetool.dsl.graph import graph, run_graph
# from nodetool.dsl.lib.ml.sklearn import PredictNode
# from nodetool.dsl.lib.ml.sklearn.datasets import LoadIrisDataset
# from nodetool.dsl.lib.ml.sklearn.metrics import AccuracyNode
# from nodetool.dsl.lib.ml.sklearn.preprocessing import (
#     StandardScalerNode,
#     TransformNode,
# )
# from nodetool.dsl.lib.ml.sklearn.model_selection import TrainTestSplitNode
# from nodetool.dsl.lib.ml.sklearn.ensemble import RandomForestClassifierNode
# from nodetool.nodes.lib.ml.sklearn.ensemble import RandomForestCriterion

# # Create dataset
# dataset = LoadIrisDataset()

# # Split data
# split = TrainTestSplitNode(
#     X=(dataset, "data"),
#     y=(dataset, "target"),
#     test_size=0.25,
#     shuffle=True,
# )

# # Scale features
# scaler = StandardScalerNode(
#     X=(split, "X_train"),
#     with_mean=True,
#     with_std=True,
# )

# # Transform test data
# transform = TransformNode(
#     X=(split, "X_test"),
#     model=(scaler, "model"),
# )

# # Train classifier
# clf = RandomForestClassifierNode(
#     X_train=(scaler, "transformed"),
#     y_train=(split, "y_train"),
#     n_estimators=100,
#     criterion=RandomForestCriterion.ENTROPY,
#     random_state=32,
# )

# # Make predictions
# predictions = PredictNode(
#     X=(transform, "transformed"),
#     model=(clf, "model"),
# )

# # Calculate accuracy
# accuracy = AccuracyNode(
#     y_true=(split, "y_test"),
#     y_pred=(predictions, "output"),
# )

# # Create and run graph
# g = graph(accuracy)
# asyncio.run(run_graph(g))
