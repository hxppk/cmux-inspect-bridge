// Use globals provided by vitest (enabled in vitest.config.js)

const surfaces = require('../../src/lib/surfaces');

describe('surfaces', () => {
  it('listBrowserSurfaces filters to type=browser', () => {
    const mockTree = vi.fn().mockReturnValue({
      surfaces: [
        { id: 'surface:1', type: 'terminal', name: 'claude' },
        { id: 'surface:2', type: 'browser', name: 'preview' },
        { id: 'surface:3', type: 'browser', name: 'preview2' },
      ],
    });
    surfaces.setCmux({ tree: mockTree });
    expect(surfaces.listBrowserSurfaces().map(s => s.id)).toEqual(['surface:2', 'surface:3']);
  });

  it('resolveTarget by surface:N returns that surface', () => {
    const mockTree = vi.fn().mockReturnValue({
      surfaces: [
        { id: 'surface:11', type: 'terminal', name: 'qwen' },
      ],
    });
    surfaces.setCmux({ tree: mockTree });
    expect(surfaces.resolveTarget('surface:11')).toBe('surface:11');
  });

  it('resolveTarget by name returns matching terminal surface id', () => {
    const mockTree = vi.fn().mockReturnValue({
      surfaces: [
        { id: 'surface:11', type: 'terminal', name: 'qwen' },
        { id: 'surface:12', type: 'terminal', name: 'claude' },
      ],
    });
    surfaces.setCmux({ tree: mockTree });
    expect(surfaces.resolveTarget('qwen')).toBe('surface:11');
    expect(surfaces.resolveTarget('claude')).toBe('surface:12');
  });

  it('resolveTarget by ambiguous name throws', () => {
    const mockTree = vi.fn().mockReturnValue({
      surfaces: [
        { id: 'surface:11', type: 'terminal', name: 'qwen' },
        { id: 'surface:99', type: 'terminal', name: 'qwen' },
      ],
    });
    surfaces.setCmux({ tree: mockTree });
    expect(() => surfaces.resolveTarget('qwen')).toThrow(/ambiguous/);
  });

  it('resolveTarget by unknown name returns null', () => {
    const mockTree = vi.fn().mockReturnValue({ surfaces: [] });
    surfaces.setCmux({ tree: mockTree });
    expect(surfaces.resolveTarget('nonexistent')).toBeNull();
  });

  it('getKnownSurfaceIds returns set of all surface ids', () => {
    const mockTree = vi.fn().mockReturnValue({
      surfaces: [
        { id: 'surface:1', type: 'terminal' },
        { id: 'surface:2', type: 'browser' },
      ],
    });
    surfaces.setCmux({ tree: mockTree });
    expect(surfaces.getKnownSurfaceIds()).toEqual(new Set(['surface:1', 'surface:2']));
  });
});
