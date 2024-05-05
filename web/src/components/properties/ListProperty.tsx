import PropertyLabel from "../node/PropertyLabel";
import ListItemProperty from "./ListItemProperty";
import { PropertyProps } from "../node/PropertyInput";

export function ListProperty(props: PropertyProps) {
  const id = `list-${props.property.name}-${props.propertyIndex}`;
  const type = props.property.type.type_args?.[0] || {
    type: "none",
    type_args: []
  };
  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id} />
      <ul className="list-view">
        {props.value?.map((item: any, i: number) => {
          let itemType = type;
          if (typeof item === "object" && "type" in item) {
            itemType = {
              type: item.type
            };
          }
          return (
            <ListItemProperty type={itemType} value={item} key={i} id={id} />
          );
        })}
      </ul>
    </>
  );
}
