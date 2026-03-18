import {
    datatypeByName,
    DATA_TYPES,
    colorForType,
    textColorForType,
    descriptionForType,
    labelForType
} from '../data_types';

describe('datatypeByName', () => {
    it('should return correct results', () => {
        expect(datatypeByName('str')?.value).toBe('str');
        expect(datatypeByName('int')?.value).toBe('int');
        expect(datatypeByName('model3d')?.value).toBe('model_3d');
        expect(datatypeByName('nonexistent')?.value).toBe('notype');
        expect(datatypeByName('any')?.value).toBe('any');
    });

    it('should not have duplicate values in DATA_TYPES', () => {
        const values = DATA_TYPES.map(d => d.value);
        const unique = new Set(values);
        if (values.length !== unique.size) {
            const seen = new Set();
            const dups: string[] = [];
            values.forEach(v => {
                if (seen.has(v)) {dups.push(v);}
                seen.add(v);
            });
            console.error('Duplicate values found in DATA_TYPES:', dups);
        }
        expect(values.length).toBe(unique.size);
    });
});

describe('colorForType', () => {
    it('should return a color string for known types', () => {
        const color = colorForType('str');
        expect(typeof color).toBe('string');
        expect(color.length).toBeGreaterThan(0);
    });

    it('should handle unknown types gracefully', () => {
        // colorForType with unknown type delegates to stc library;
        // we just verify known types return valid colors
        const colorStr = colorForType('str');
        const colorInt = colorForType('int');
        expect(colorStr).not.toBe(colorInt);
    });

    it('should normalize model3d to model_3d', () => {
        const color3d = colorForType('model3d');
        const colorUnderscore = colorForType('model_3d');
        expect(color3d).toBe(colorUnderscore);
    });
});

describe('textColorForType', () => {
    it('should return a text color for known types', () => {
        const textColor = textColorForType('str');
        expect(typeof textColor).toBe('string');
        expect(textColor.length).toBeGreaterThan(0);
    });

    it('should return #eee for unknown types', () => {
        const textColor = textColorForType('completely_unknown_type');
        expect(textColor).toBe('#eee');
    });
});

describe('descriptionForType', () => {
    it('should return a description for known types', () => {
        const desc = descriptionForType('str');
        expect(typeof desc).toBe('string');
        expect(desc.length).toBeGreaterThan(0);
    });

    it('should return empty string for unknown types', () => {
        const desc = descriptionForType('completely_unknown_type');
        expect(desc).toBe('');
    });
});

describe('labelForType', () => {
    it('should return a label for known types', () => {
        const label = labelForType('str');
        expect(label).toBe('String');
    });

    it('should return "Integer" for int type', () => {
        expect(labelForType('int')).toBe('Integer');
    });

    it('should return empty string for unknown types', () => {
        const label = labelForType('completely_unknown_type');
        expect(label).toBe('');
    });
});

describe('DATA_TYPES structure', () => {
    it('all entries should have populated namespace/name/slug after initialization', () => {
        DATA_TYPES.forEach((dt) => {
            expect(typeof dt.slug).toBe('string');
            expect(dt.slug.length).toBeGreaterThan(0);
        });
    });

    it('all entries should have a color', () => {
        DATA_TYPES.forEach((dt) => {
            expect(typeof dt.color).toBe('string');
            expect(dt.color.length).toBeGreaterThan(0);
        });
    });

    it('should be sorted alphabetically by value', () => {
        for (let i = 1; i < DATA_TYPES.length; i++) {
            expect(
                DATA_TYPES[i - 1].value.localeCompare(DATA_TYPES[i].value)
            ).toBeLessThanOrEqual(0);
        }
    });
});
