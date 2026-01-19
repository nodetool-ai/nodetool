describe('BASE_URL Module', () => {
  describe('Module structure', () => {
    it('module can be imported without throwing', () => {
      expect(() => {
        require('./BASE_URL');
      }).not.toThrow();
    });

    it('defines defaultLocalUrl constant', () => {
      const { defaultLocalUrl } = require('./BASE_URL');
      expect(defaultLocalUrl).toBeDefined();
    });

    it('defines BASE_URL constant', () => {
      const { BASE_URL } = require('./BASE_URL');
      expect(BASE_URL).toBeDefined();
    });
  });
});
