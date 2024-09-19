import React from "react";
import { useRouteError } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Typography,
  Box,
  Button,
  ThemeProvider,
  createTheme
} from "@mui/material";

const theme = createTheme({
  palette: {
    primary: {
      main: "#6200EA"
    },
    background: {
      default: "#E8EAF6"
    }
  }
});

const ErrorBoundary: React.FC = () => {
  const error = useRouteError();
  console.error(error);

  return (
    <ThemeProvider theme={theme}>
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        height="100vh"
        textAlign="center"
        padding={2}
        sx={{
          background: "linear-gradient(135deg, #A5D6A7 0%, #FFAB91 100%)",
          boxShadow: "inset 0 0 100px rgba(0,0,0,0.1)"
        }}
      >
        <motion.div
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Typography variant="h1" gutterBottom>
            😱
          </Typography>
        </motion.div>
        <Typography variant="h4" gutterBottom sx={{ color: "#303F9F" }}>
          Oh no! Our code has been abducted by aliens!
        </Typography>
        <Typography variant="body1" paragraph sx={{ color: "#3F51B5" }}>
          Please report this error in{" "}
          <a
            href="https://github.com/nodetool-ai/nodetool/issues"
            style={{ color: "#6200EA" }}
          >
            our issue tracker
          </a>
          .
        </Typography>
        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
          <Button
            variant="contained"
            color="primary"
            onClick={() => window.location.reload()}
            sx={{
              backgroundColor: "#6200EA",
              "&:hover": {
                backgroundColor: "#3700B3"
              }
            }}
          >
            Attempt a daring rescue mission
          </Button>
        </motion.div>
      </Box>
    </ThemeProvider>
  );
};

export default ErrorBoundary;
