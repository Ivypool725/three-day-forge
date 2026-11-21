import { defineConfig, loadEnv } from 'vite';
import { customerApi } from './server/customer.mjs';
const pack=process.env.PACK==='1';
export default defineConfig(({mode})=>{
  const key=process.env.KSYUN_API_KEY || loadEnv(mode,process.cwd(),'KSYUN_').KSYUN_API_KEY;
  const install=(server)=>{server.middlewares.use(customerApi(key));};
  return {
    base:'./', server:{port:5173,host:'127.0.0.1'},
    plugins:[{name:'qingxi-customer',configureServer:install,configurePreviewServer:install}],
    build:{target:'es2022',outDir:pack?'release':'dist',emptyOutDir:true,assetsInlineLimit:pack?()=>true:undefined,chunkSizeWarningLimit:pack?100000:2500},
    test:{include:['tests/**/*.test.ts']}
  };
});
