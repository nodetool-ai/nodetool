import { Typography } from "@mui/material";
import { ThreadMessage } from "../../stores/ApiTypes";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";

export default function ThreadMessageProperty(props: PropertyProps) {
  const id = `thread-message-${props.property.name}-${props.propertyIndex}`;
  const msg = props.value as ThreadMessage;
  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id} />
      {msg.content?.map((content, i) => {
        if (content.type === "message_text_content") {
          return <Typography key={'_' + i}>{content.text}</Typography>;
        } else if (content.type === "message_image_content") {
          return <img key={'_' + i} src={content.image?.uri} alt="" />;
        } else {
          return <></>;
        }
      })}
    </>
  );
}
