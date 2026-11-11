import { basename } from 'node:path';

/** Select the native codec branch for the image draw module alone. */
export function imageNodePlugin() {
  return {
    name: 'native-image-draw-config',
    setup(build) {
      build.onResolve({filter:/^@nodetool-ai\/config$/}, args => {
        if (basename(args.importer) === 'lib-image-draw.js') return {path:'draw-config',namespace:'native-image-draw'};
      });
      build.onLoad({filter:/.*/,namespace:'native-image-draw'}, () => ({contents:'export const IS_NODE = true;',loader:'js'}));
    }
  };
}
