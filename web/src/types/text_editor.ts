export type SearchParam =
  | string
  | { target: { value: string } }
  | { currentTarget: { value: string } }
  | { searchTerm: string }
  | { value: string };
