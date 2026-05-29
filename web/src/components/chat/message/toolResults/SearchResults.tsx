import React from "react";
import { FlexColumn, FlexRow, Text } from "../../../ui_primitives";
import type { SearchResultItem } from "./parseSearchResults";

interface SearchResultsProps {
  items: SearchResultItem[];
}

const SearchResultsBase: React.FC<SearchResultsProps> = ({ items }) => (
  <FlexColumn gap={1} className="tool-search-results">
    {items.map((item, index) => (
      <FlexRow
        key={`${index}-${item.url ?? item.title}`}
        gap={1}
        align="flex-start"
        className="tool-search-result"
        sx={{ minWidth: 0 }}
      >
        <Text
          component="span"
          size="small"
          className="tool-search-index"
          sx={{
            color: "text.disabled",
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
            minWidth: "1.4em",
            textAlign: "right"
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </Text>
        <FlexColumn gap={0.25} sx={{ minWidth: 0, flex: 1 }}>
          <FlexRow gap={1} justify="space-between" align="baseline" sx={{ minWidth: 0 }}>
            {item.url ? (
              <Text
                component="a"
                size="small"
                weight={500}
                truncate
                className="tool-search-title"
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "text.primary", textDecoration: "none", minWidth: 0 }}
              >
                {item.title}
              </Text>
            ) : (
              <Text
                component="span"
                size="small"
                weight={500}
                truncate
                className="tool-search-title"
                sx={{ color: "text.primary", minWidth: 0 }}
              >
                {item.title}
              </Text>
            )}
            {item.source && (
              <Text
                component="span"
                size="small"
                truncate
                className="tool-search-source"
                sx={{ color: "text.disabled", flexShrink: 0, maxWidth: "40%" }}
              >
                {item.source}
              </Text>
            )}
          </FlexRow>
          {item.snippet && (
            <Text
              component="span"
              size="small"
              className="tool-search-snippet"
              sx={{ color: "text.secondary" }}
            >
              {item.snippet}
            </Text>
          )}
        </FlexColumn>
      </FlexRow>
    ))}
  </FlexColumn>
);

export const SearchResults = React.memo(SearchResultsBase);
SearchResults.displayName = "SearchResults";
