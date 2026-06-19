import * as React from "react";
import { FavoriteButton, FlexRow } from "nodetool";

export const Variants = () => {
  const [star, setStar] = React.useState(true);
  const [heart, setHeart] = React.useState(true);
  const [bookmark, setBookmark] = React.useState(false);
  return (
    <FlexRow gap={2} align="center">
      <FavoriteButton variant="star" isFavorite={star} onToggle={setStar} />
      <FavoriteButton variant="heart" isFavorite={heart} onToggle={setHeart} />
      <FavoriteButton variant="bookmark" isFavorite={bookmark} onToggle={setBookmark} />
    </FlexRow>
  );
};

export const States = () => {
  const [on, setOn] = React.useState(true);
  const [off, setOff] = React.useState(false);
  return (
    <FlexRow gap={2} align="center">
      <FavoriteButton isFavorite={off} onToggle={setOff} addTooltip="Star model" />
      <FavoriteButton isFavorite={on} onToggle={setOn} removeTooltip="Unstar model" />
      <FavoriteButton isFavorite={true} onToggle={() => {}} disabled />
    </FlexRow>
  );
};

export const Sizes = () => {
  const [a, setA] = React.useState(true);
  const [b, setB] = React.useState(true);
  const [c, setC] = React.useState(true);
  return (
    <FlexRow gap={2} align="center">
      <FavoriteButton isFavorite={a} onToggle={setA} buttonSize="small" />
      <FavoriteButton isFavorite={b} onToggle={setB} buttonSize="medium" />
      <FavoriteButton isFavorite={c} onToggle={setC} buttonSize="large" />
    </FlexRow>
  );
};
