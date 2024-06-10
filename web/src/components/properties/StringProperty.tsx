import PropertyLabel from "../node/PropertyLabel";
import TextareaAutosize from "react-textarea-autosize";
import { PropertyProps } from "../node/PropertyInput";

export default function StringProperty(props: PropertyProps) {
  const id = `textfield-${props.property.name}-${props.propertyIndex}`;

  return (
    <div>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <TextareaAutosize
        // causing too many re-renders, see https://stackoverflow.com/questions/64837884/material-ui-too-many-re-renders-the-layout-is-unstable-textareaautosize-limit
        // > trying to fix this by using TextareaAutosize instead.
        // > switched to TextareaAutosize from 'react-textarea-autosize'. seems to fix 'ResizeObserver loop limit exceeded'
        id={id}
        name={props.property.name}
        minRows={1}
        maxRows={4}
        className="nodrag nowheel"
        value={props.value}
        onChange={(e) => {
          props.onChange(e.target.value);
        }}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
      />
    </div>
  );
}
