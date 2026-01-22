import React, { useCallback, useEffect, useState, memo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Box,
  CircularProgress,
} from "@mui/material";
import { Asset } from "../../stores/ApiTypes";
import { useFileDrop } from "../../hooks/handlers/useFileDrop";
import { useAssetStore } from "../../stores/AssetStore";

export type AssetTableProps = {
  assetIds: string[];
  onChange: (assetIds: string[]) => void;
};

const AssetTable: React.FC<AssetTableProps> = (props) => {
  const { assetIds, onChange } = props;
  const [assets, setAssets] = useState<Asset[]>([]);
  const getAsset = useAssetStore((state) => state.get);

  useEffect(() => {
    const promises = assetIds.map((assetId) => getAsset(assetId));
    Promise.all(promises).then((assets) => {
      setAssets(assets.filter((a) => a !== null) as Asset[]);
    });
  }, [getAsset, assetIds]);

  const handleRemoveAsset = useCallback(
    (asset: Asset) => {
      const newAssets = assets.filter((a) => a.id !== asset.id);
      setAssets(newAssets);
      onChange(newAssets.map((a) => a.id));
    },
    [onChange, assets]
  );

  const handleAssetRemoveClick = useCallback(
    (asset: Asset) => {
      handleRemoveAsset(asset);
    },
    [handleRemoveAsset]
  );

  const { onDrop, onDragOver, uploading } = useFileDrop({
    uploadAsset: true,
    onChangeAsset: (asset: Asset) => {
      const newAssets = [...assets, asset];
      setAssets(newAssets);
      onChange(newAssets.map((a) => a.id));
    },
    type: "all",
  });

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Asset Type</TableCell>
            <TableCell></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {assets.map((asset, index) => (
            <TableRow key={index}>
              <TableCell>
                {asset.name} ({asset.content_type})
              </TableCell>
              <TableCell>
                <Button
                  variant="outlined"
                  onClick={handleAssetRemoveClick.bind(null, asset)}
                >
                  Remove
                </Button>
              </TableCell>
            </TableRow>
          ))}
          <TableRow key="last">
            <TableCell>
              {uploading ? (
                <CircularProgress />
              ) : (
                <Box
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  sx={{
                    border: 1,
                    borderStyle: "dotted",
                    height: 60,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  Drop file here
                </Box>
              )}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
};

const AssetTableMemo = memo(AssetTable);

export default AssetTableMemo;
