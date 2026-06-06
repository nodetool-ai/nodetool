import { describe, it, expect } from "vitest";
import {
  prop,
  registerDeclaredProperty,
  getDeclaredPropertiesForClass
} from "../src/decorators.js";

describe("registerDeclaredProperty / getDeclaredPropertiesForClass", () => {
  it("registers a property on a class", () => {
    class TestNode {}
    registerDeclaredProperty(TestNode, "myProp", {
      type: "str",
      default: "hello"
    });
    const props = getDeclaredPropertiesForClass(TestNode);
    expect(props).toHaveLength(1);
    expect(props[0].name).toBe("myProp");
    expect(props[0].options.type).toBe("str");
    expect(props[0].options.default).toBe("hello");
  });

  it("registers multiple properties", () => {
    class MultiNode {}
    registerDeclaredProperty(MultiNode, "a", { type: "int", default: 0 });
    registerDeclaredProperty(MultiNode, "b", { type: "float", default: 1.5 });
    registerDeclaredProperty(MultiNode, "c", { type: "str" });
    const props = getDeclaredPropertiesForClass(MultiNode);
    expect(props).toHaveLength(3);
    expect(props.map((p) => p.name)).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for class with no props", () => {
    class EmptyNode {}
    const props = getDeclaredPropertiesForClass(EmptyNode);
    expect(props).toEqual([]);
  });

  it("overrides a property if re-registered with the same name", () => {
    class OverrideNode {}
    registerDeclaredProperty(OverrideNode, "x", { type: "int", default: 1 });
    registerDeclaredProperty(OverrideNode, "x", { type: "float", default: 2.5 });
    const props = getDeclaredPropertiesForClass(OverrideNode);
    expect(props).toHaveLength(1);
    expect(props[0].options.type).toBe("float");
    expect(props[0].options.default).toBe(2.5);
  });

  it("inherits properties from parent class", () => {
    class ParentNode {}
    registerDeclaredProperty(ParentNode, "parentProp", {
      type: "str",
      default: "parent"
    });
    class ChildNode extends ParentNode {}
    registerDeclaredProperty(ChildNode, "childProp", {
      type: "int",
      default: 42
    });
    const props = getDeclaredPropertiesForClass(ChildNode);
    expect(props).toHaveLength(2);
    expect(props.map((p) => p.name)).toContain("parentProp");
    expect(props.map((p) => p.name)).toContain("childProp");
  });

  it("child can override parent property", () => {
    class Base {}
    registerDeclaredProperty(Base, "shared", {
      type: "str",
      default: "base"
    });
    class Child extends Base {}
    registerDeclaredProperty(Child, "shared", {
      type: "str",
      default: "child"
    });
    const props = getDeclaredPropertiesForClass(Child);
    const sharedProp = props.find((p) => p.name === "shared");
    expect(sharedProp?.options.default).toBe("child");
  });

  it("parent is not affected by child registrations", () => {
    class Parent2 {}
    registerDeclaredProperty(Parent2, "p", { type: "int", default: 0 });
    class Child2 extends Parent2 {}
    registerDeclaredProperty(Child2, "c", { type: "int", default: 1 });
    const parentProps = getDeclaredPropertiesForClass(Parent2);
    expect(parentProps).toHaveLength(1);
    expect(parentProps[0].name).toBe("p");
  });
});

describe("@prop decorator", () => {
  it("registers properties via decorator syntax", () => {
    class DecoratedNode {
      @prop({ type: "str", default: "greet" })
      declare greeting: string;

      @prop({ type: "int", default: 100, min: 0, max: 1000 })
      declare count: number;
    }
    const props = getDeclaredPropertiesForClass(DecoratedNode);
    expect(props).toHaveLength(2);
    const greeting = props.find((p) => p.name === "greeting");
    expect(greeting?.options.type).toBe("str");
    expect(greeting?.options.default).toBe("greet");
    const count = props.find((p) => p.name === "count");
    expect(count?.options.type).toBe("int");
    expect(count?.options.min).toBe(0);
    expect(count?.options.max).toBe(1000);
  });

  it("preserves optional fields", () => {
    class WithOptionals {
      @prop({
        type: "str",
        title: "My Title",
        description: "My description",
        required: true,
        values: ["a", "b", "c"]
      })
      declare choice: string;
    }
    const props = getDeclaredPropertiesForClass(WithOptionals);
    expect(props[0].options.title).toBe("My Title");
    expect(props[0].options.description).toBe("My description");
    expect(props[0].options.required).toBe(true);
    expect(props[0].options.values).toEqual(["a", "b", "c"]);
  });
});
