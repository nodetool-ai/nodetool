import "@mui/material/styles";

declare module "@mui/material/styles" {
  interface ThemeOptions {
    fontSizeGiant?: string;
    fontSizeBigger?: string;
    fontSizeBig?: string;
    fontSizeNormal?: string;
    fontSizeSmall?: string;
    fontSizeSmaller?: string;
    fontSizeTiny?: string;
    fontSizeTinyer?: string;
    fontFamily1?: string;
    fontFamily2?: string;
  }

  interface Theme {
    fontSizeGiant: string;
    fontSizeBigger: string;
    fontSizeBig: string;
    fontSizeNormal: string;
    fontSizeSmall: string;
    fontSizeSmaller?: string;
    fontSizeTiny?: string;
    fontSizeTinyer?: string;
    fontFamily1: string;
    fontFamily2: string;
  }
}
