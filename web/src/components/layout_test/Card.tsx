/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  Card,
  CardActions,
  CardContent,
  Button,
  Typography,
  Box
} from "@mui/material";

const styles = {
  root: css`
    min-width: 275px;
    margin: 8px;
  `,
  bullet: css`
    display: inline-block;
    margin: 0 2px;
    transform: scale(0.8);
  `,
  title: css`
    font-size: 14px;
  `,
  pos: css`
    margin-bottom: 12px;
  `
};

const CardDemo = () => {
  const bull = (
    <Box component="span" css={styles.bullet}>
      •
    </Box>
  );

  return (
    <Card css={styles.root}>
      <CardContent>
        <Typography css={styles.title} color="text.secondary" gutterBottom>
          Word of the Day
        </Typography>
        <Typography variant="h5" component="div">
          be{bull}nev{bull}o{bull}lent
        </Typography>
        <Typography css={styles.pos} color="text.secondary">
          adjective
        </Typography>
        <Typography variant="body2">
          well meaning and kindly.
          <br />
          {'"a benevolent smile"'}
        </Typography>
      </CardContent>
      <CardActions>
        <Button size="small">Learn More</Button>
      </CardActions>
    </Card>
  );
};

export default CardDemo;
