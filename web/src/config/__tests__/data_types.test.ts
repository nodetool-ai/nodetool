import { datatypeByName, DATA_TYPES } from '../data_types';

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
