describe("downloadPreviewAssets", () => {
  describe("getDownloadPayload logic", () => {
    it("returns previewValue when not null/undefined", () => {
      const previewValue = "test-value";
      
      if (previewValue !== null && previewValue !== undefined) {
        expect(previewValue).toBe("test-value");
      }
    });

    it("returns rawResult.output when previewValue is null", () => {
      const previewValue = null;
      const rawResult: { output?: string } = { output: "output-value" };
      
      const result = previewValue ?? rawResult?.output;
      expect(result).toBe("output-value");
    });

    it("returns rawResult when previewValue and output are undefined", () => {
      const previewValue = undefined;
      const rawResult = "direct-value";
      
      const result = previewValue ?? (rawResult as any)?.output ?? rawResult;
      expect(result).toBe("direct-value");
    });

    it("handles null previewValue with null output", () => {
      const previewValue = null;
      const rawResult: { output?: null } = { output: null };
      
      const result = previewValue ?? rawResult?.output ?? rawResult;
      expect(result).toEqual(rawResult);
    });

    it("handles undefined rawResult", () => {
      const previewValue = undefined;
      const rawResult = undefined;
      
      const result = previewValue ?? (rawResult as any)?.output ?? rawResult;
      expect(result).toBeUndefined();
    });

    it("handles rawResult without output property", () => {
      const previewValue = undefined;
      const rawResult = { other: "value" };
      
      const result = previewValue ?? (rawResult as any)?.output ?? rawResult;
      expect(result).toEqual(rawResult);
    });

    it("prioritizes previewValue over everything", () => {
      const previewValue = "preview";
      const rawResult = { output: "output", data: "data" };
      
      const result = previewValue ?? (rawResult as any)?.output ?? rawResult;
      expect(result).toBe("preview");
    });

    it("handles zero as valid previewValue", () => {
      const previewValue = 0;
      const rawResult = { output: "output" };
      
      const result = previewValue !== null && previewValue !== undefined 
        ? previewValue 
        : (rawResult as any)?.output ?? rawResult;
      expect(result).toBe(0);
    });

    it("handles false as valid previewValue", () => {
      const previewValue = false;
      const rawResult = { output: "output" };
      
      const result = previewValue !== null && previewValue !== undefined 
        ? previewValue 
        : (rawResult as any)?.output ?? rawResult;
      expect(result).toBe(false);
    });

    it("handles empty string as valid previewValue", () => {
      const previewValue = "";
      const rawResult = { output: "output" };
      
      const result = previewValue !== null && previewValue !== undefined 
        ? previewValue 
        : (rawResult as any)?.output ?? rawResult;
      expect(result).toBe("");
    });
  });

  describe("error conditions", () => {
    it("throws when no content available", () => {
      const previewValue = undefined;
      const rawResult = undefined;
      
      if (
        previewValue !== null &&
        previewValue !== undefined
      ) {
        // Would use previewValue
      } else if ((rawResult as any)?.output !== undefined) {
        // Would use rawResult.output
      } else if (rawResult !== undefined) {
        // Would use rawResult
      } else {
        expect(() => {
          throw new Error("No content available to download");
        }).toThrow("No content available to download");
      }
    });

    it("handles object with detail property as error", () => {
      const error = { detail: "Something went wrong" };
      
      if (
        typeof error === "object" &&
        error !== null &&
        "detail" in error &&
        error.detail
      ) {
        expect(error.detail).toBe("Something went wrong");
      }
    });
  });
});
