import React, { useCallback, useEffect, useState, memo, useMemo } from "react";
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

interface AssetTableRowProps {
  asset: Asset;
  onRemove: (asset: Asset) => void;
}

const AssetTableRow: React.FC<AssetTableRowProps> = memo(({ asset, onRemove }) => {
  const handleRemove = useCallback(() => {
    onRemove(asset);
  }, [asset, onRemove]);

  return (
    <TableRow>
      <TableCell>
        {asset.name} ({asset.content_type})
      </TableCell>
      <TableCell>
        <Button
          variant="outlined"
          onClick={handleRemove}
        >
          Remove
        </Button>
      </TableCell>
    </TableRow>
  );
});
AssetTableRow.displayName = "AssetTableRow";

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

  const { onDrop, onDragOver, uploading } = useFileDrop({
    uploadAsset: true,
    onChangeAsset: (asset: Asset) => {
      const newAssets = [...assets, asset];
      setAssets(newAssets);
      onChange(newAssets.map((a) => a.id));
    },
    type: "all",
  });

  const dropZoneStyle = useMemo(() => ({
    border: 1,
    borderStyle: "dotted" as const,
    height: 60,
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  }), []);

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
            <AssetTableRow
              key={asset.id || index}
              asset={asset}
              onRemove={handleRemoveAsset}
            />
          ))}
          <TableRow key="last">
            <TableCell>
              {uploading ? (
                <CircularProgress />
              ) : (
                <Box
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  sx={dropZoneStyle}
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
