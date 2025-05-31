export type DroppedFile = {
  dataUri: string;
  type: string;
  name: string;
};

export const DOC_TYPES_REGEX =
  /application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.*|application\/vnd\.ms-.*|application\/vnd\.apple\.*|application\/x-iwork.*/;