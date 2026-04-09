// import { terser } from 'rollup-plugin-terser';
import terser from '@rollup/plugin-terser';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

const banner = '/*! ConsentFlow v1.0.0 */';

export default [
  {
    input: 'src/index.js',
    output: {
      file: 'dist/consentflow.esm.js',
      format: 'es',
      sourcemap: true,
      banner
    },
    plugins: [ nodeResolve(), commonjs() , terser()]
  },
  {
    input: 'src/index.js',
    output: {
      file: 'dist/consentflow.min.js',
      format: 'umd',
      name: 'ConsentFlow',
      sourcemap: true,
      exports: 'named',
      banner
    },
    plugins: [ nodeResolve(), commonjs(), terser() ]
  }
];
