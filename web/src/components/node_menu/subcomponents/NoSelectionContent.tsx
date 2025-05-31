import React, { memo, useCallback } from "react";
import { usePanelStore } from "../../../stores/PanelStore";

interface Props {
  searchTerm: string;
  selectedPathString: string;
  minSearchTermLength: number;
}

const NoSelectionContent: React.FC<Props> = ({ searchTerm, selectedPathString, minSearchTermLength }) => {
  const handleViewChange = usePanelStore((state) => state.handleViewChange);

  const openPacksPanel = useCallback(() => {
    handleViewChange("packs");
  }, [handleViewChange]);

  return (
    <div className="no-selection">
      {searchTerm.length > minSearchTermLength ? (
        <>
          <p>
            {selectedPathString ? (
              <>
                Nothing found in this namespace for
                <strong className="highlighted-text"> {searchTerm}</strong>
              </>
            ) : (
              <>
                Nothing found for <strong className="highlighted-text"> {searchTerm}</strong>
              </>
            )}
          </p>
          <p>
            {"Try a different search term or adjust your filters."}
          </p>
        </>
      ) : (
        <>
          <p>Select a namespace or search to see nodes.</p>
          <p>
            Looking for more nodes? Check out the {" "}
            <button onClick={openPacksPanel} className="link-button">
              Node Packs
            </button>
          </p>
          <ul>
            <li>
              <a
                href="https://forum.nodetool.ai"
                target="_blank"
                rel="noopener,noreferrer"
              >
                Nodetool Forum
              </a>
            </li>
          </ul>
        </>
      )}
    </div>
  );
};

export default memo(NoSelectionContent);
