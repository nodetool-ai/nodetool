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
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Asset } from "../../stores/ApiTypes";
import { useFileDrop } from "../../hooks/handlers/useFileDrop";
import { useAssetStore } from "../../stores/AssetStore";

export type AssetTableProps = {
  assetIds: string[];
  onChange: (assetIds: string[]) => void;
};

interface AssetTableRowProps {
  asset: Asset;
  onRemove: (asset: Asset) => void;
}

const AssetTableRow = memo(function AssetTableRow({
  asset,
  onRemove
}: AssetTableRowProps) {
  const handleRemove = useCallback(() => {
    onRemove(asset);
  }, [asset, onRemove]);

  return (
    <TableRow
      sx={{
        display: 'flex',
        flex: '1 0 auto',
        width: '100%',
      }}
    >
      <TableCell
        sx={{
          flex: '1',
          minWidth: 0,
        }}
      >
        {asset.name} ({asset.content_type})
      </TableCell>
      <TableCell
        sx={{
          flex: '0 0 auto',
        }}
      >
        <Button variant="outlined" onClick={handleRemove}>
          Remove
        </Button>
      </TableCell>
    </TableRow>
  );
});

const AssetTable: React.FC<AssetTableProps> = (props) => {
  const { assetIds, onChange } = props;
  const [assets, setAssets] = useState<Asset[]>([]);
  const getAsset = useAssetStore((state) => state.get);

  useEffect(() => {
    const promises = assetIds.map((id) => getAsset(id));
    Promise.all(promises)
      .then((fetchedAssets) => {
        setAssets(fetchedAssets.filter((a): a is Asset => !!a));
      })
      .catch((error) => {
        console.error("Failed to fetch assets:", error);
        setAssets([]);
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
      // Logic to handle new asset drop
      // This part seems to imply we add the new asset to the list
      // But props.onChange expects IDs.
      // We should probably just rely on the parent updating props.
      // But for local state:
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

  // Memoize assets array to avoid recreating Row callback
  const memoizedAssets = useMemo(() => assets, [assets]);

  // Virtualized row renderer for react-window
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const asset = memoizedAssets[index];
    if (!asset) {
      return null;
    }
    return (
      <div style={style}>
        <AssetTableRow
          asset={asset}
          onRemove={handleRemoveAsset}
        />
      </div>
    );
  }, [memoizedAssets, handleRemoveAsset]);

  // Calculate list height based on number of items + drop zone row
  const rowHeight = 53; // Approximate height of a TableRow
  const dropZoneHeight = 80;
  const listHeight = Math.min(400, assets.length * rowHeight + dropZoneHeight);

  // For small lists (< 20 items), render the traditional table for simplicity
  const shouldVirtualize = assets.length >= 20;

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
          {shouldVirtualize ? (
            <TableRow>
              <TableCell colSpan={2} sx={{ padding: 0, height: listHeight }}>
                <AutoSizer disableHeight>
                  {({ width }: { width: number }) => (
                    <List
                      height={listHeight}
                      itemCount={assets.length}
                      itemSize={rowHeight}
                      width={width}
                    >
                      {Row}
                    </List>
                  )}
                </AutoSizer>
              </TableCell>
            </TableRow>
          ) : (
            assets.map((asset, index) => (
              <AssetTableRow
                key={asset.id || index}
                asset={asset}
                onRemove={handleRemoveAsset}
              />
            ))
          )}
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
AssetTable.displayName = "AssetTable";

export default memo(AssetTable);
