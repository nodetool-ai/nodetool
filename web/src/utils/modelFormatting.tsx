import React from "react";
import { UnifiedModel } from "../stores/ApiTypes";
import ModelIcon from "../icons/model.svg";
import PetsIcon from "@mui/icons-material/Pets";

export const prettifyModelType = (type: string) => {
  if (type === "All") return type;

  if (type === "llama_model") {
    return (
      <>
        <img
          src="/ollama.png"
          alt="Ollama"
          style={{
            width: "16px",
            marginRight: "8px",
            filter: "invert(1)"
          }}
        />
        Ollama
      </>
    );
  }

  if (type === "llama_cpp") {
    return (
      <>
        <PetsIcon style={{ fontSize: 18, marginRight: 8 }} />
        Llama cpp
      </>
    );
  }

  const parts = type.split(".");
  if (parts[0] === "hf") {
    parts.shift();
    return (
      <>
        <img
          src="https://huggingface.co/front/assets/huggingface_logo-noborder.svg"
          alt="Hugging Face"
          style={{ width: "20px", marginRight: "8px" }}
        />
        {parts
          .map((part) =>
            part
              .split("_")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ")
          )
          .join(" ")}
      </>
    );
  }

  return (
    <>
      <img
        src={ModelIcon}
        alt="Model"
        style={{
          width: "20px",
          marginRight: "8px",
          filter: "invert(1)"
        }}
      />
      {type
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")}
    </>
  );
};

export const getShortModelName = (fullName: string | undefined): string => {
  if (!fullName) return "";
  const lastSlashIndex = fullName.lastIndexOf("/");
  if (lastSlashIndex !== -1 && lastSlashIndex < fullName.length - 1) {
    return fullName.substring(lastSlashIndex + 1);
  }
  return fullName;
};

export const formatBytes = (bytes?: number): string => {
  if (bytes === undefined || bytes === null || isNaN(bytes)) {
    return "";
  }
  if (bytes === 0) return "0 Bytes";
  const bytesPerKilobyte = 1024;
  const decimalPlaces = 2;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const sizeIndex = Math.floor(Math.log(bytes) / Math.log(bytesPerKilobyte));
  return parseFloat((bytes / Math.pow(bytesPerKilobyte, sizeIndex)).toFixed(decimalPlaces)) + " " + sizes[sizeIndex];
};

export const groupModelsByType = (models: UnifiedModel[]) => {
  return models.reduce((acc, model) => {
    const type = model.type || "Other";
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(model);
    return acc;
  }, {} as Record<string, UnifiedModel[]>);
};

export const sortModelTypes = (types: string[]) => {
  const getOrder = (type: string) => {
    switch (type) {
      case "All":
        return 0;
      case "llama_model":
        return 1;
      case "llama_cpp":
        return 1;
      case "mlx":
        return 1;
      case "Other":
        return 3;
      default:
        return 4;
    }
  };

  return types.sort((a, b) => {
    const orderA = getOrder(a);
    const orderB = getOrder(b);

    if (orderA < orderB) {
      return -1;
    }
    if (orderA > orderB) {
      return 1;
    }
    return a.localeCompare(b);
  });
};
