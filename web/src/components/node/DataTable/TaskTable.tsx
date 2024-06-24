/** @jsxImportSource @emotion/react */
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  TabulatorFull as Tabulator,
} from "tabulator-tables";
import "tabulator-tables/dist/css/tabulator.min.css";
import "tabulator-tables/dist/css/tabulator_midnight.css";
import { useClipboard } from "../../../hooks/browser/useClipboard";
import { useNotificationStore } from "../../../stores/NotificationStore";
import {
  Button,
  Tooltip
} from "@mui/material";
import { styles } from "./TableStyles";
import { Task } from "../../../stores/ApiTypes";

export type ListDataType = "int" | "string" | "datetime" | "float";
export type TaskTableProps = {
  data: Task[];
};

const columns = [
  {
    title: "Name",
    field: "name",
    editable: false,
  },
  {
    title: "Task Type",
    field: "task_type",
    editable: false,
  },
  {
    title: "Status",
    field: "status",
    editable: false,
  },
  {
    title: "Instructions",
    field: "instructions",
    editable: false,
  },
  {
    title: "Dependencies",
    field: "dependencies",
    editable: false,
  },
  {
    title: "Result",
    field: "result",
    editable: false,
  }
];

const TaskTable: React.FC<TaskTableProps> = ({
  data,
}) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { writeClipboard } = useClipboard();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  useEffect(() => {
    if (!tableRef.current) return;

    const tabulatorInstance = new Tabulator(tableRef.current, {
      height: "300px",
      data: data,
      columns: columns,
      columnDefaults: {
        headerSort: true,
        hozAlign: "left",
        headerHozAlign: "left",
        editor: "input",
        resizable: true,
        editable: false,
      },
    });

    return () => {
      tabulatorInstance.destroy();
    };
  }, [data]);

  const copyData = useCallback(() => {
    writeClipboard(JSON.stringify(data), true);
    addNotification({
      content: "Copied to clipboard",
      type: "success",
      alert: true
    });
  }, [data, writeClipboard, addNotification]);

  return (
    <div ref={ref} className="listtable nowheel nodrag" css={styles}>
      <div className="table-actions">
        <Tooltip title="Copy table data to clipboard">
          <Button variant="outlined" onClick={copyData}>
            Copy Data
          </Button>
        </Tooltip>
      </div>
      <div ref={tableRef} className="listtable" />
    </div>
  );
};

export default TaskTable;
