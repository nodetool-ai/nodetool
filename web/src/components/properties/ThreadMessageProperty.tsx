import { Typography } from "@mui/material";
import { Message, MessageContent } from "../../stores/ApiTypes";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import { memo } from "react";
import { isEqual } from "lodash";

const ThreadMessageProperty = (props: PropertyProps) => {
  const id = `thread-message-${props.property.name}-${props.propertyIndex}`;
  const msg = props.value as Message;
  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      {typeof msg.content === "string" && (
        <Typography>{msg.content}</Typography>
      )}
      {Array.isArray(msg.content) &&
        msg.content?.map((content: MessageContent, i: number) => {
          if (content.type === "text") {
            return <Typography key={"_" + i}>{content.text}</Typography>;
          } else if (content.type === "image_url") {
            return <img key={"_" + i} src={content.image?.uri} alt="" />;
          } else {
            return <></>;
          }
        })}
    </>
  );
};

export default memo(ThreadMessageProperty, isEqual);
