import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error 服务端原生 Node ESM
import {customerApi} from '../server/customer.mjs';
async function call(key:string,text:string,send=vi.fn()) {
  const req={url:'/api/customer',method:'POST',headers:{},async *[Symbol.asyncIterator](){yield text;}};
  let status=0,data:{source?:string,line?:string}={};
  const res={writeHead(n:number){status=n;},end(s:string){data=JSON.parse(s);}};
  await customerApi(key,send)(req,res,()=>{});return {status,data};
}
const input=JSON.stringify({index:1,grade:'合格'});
describe('顾客回应接口',()=>{
  it('无 Key 正常回退，剧情顾客不调用模型',async()=>{
    const send=vi.fn();expect((await call('',input,send)).data.source).toBe('local');
    expect((await call('test',JSON.stringify({index:5,grade:'合格'}),send)).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
  it('模拟模型成功返回并仅传送当前订单',async()=>{
    const fake=vi.fn().mockResolvedValue({ok:true,json:async()=>({choices:[{message:{content:'手感正好，后厨正等着呢。'}}]})});
    const r=await call('test',input,fake);expect(r.data.source).toBe('model');
    const prompt=JSON.parse(fake.mock.calls[0][1].body).messages[1].content;
    expect(prompt).toContain('小荷');expect(prompt).not.toContain('孙承安');
  });
  it('异常、空回复、剧透与越界输入均回退',async()=>{
    for(const line of ['', '那孙承安昨天还来买过菜呢。']){
      const fake=vi.fn().mockResolvedValue({ok:true,json:async()=>({choices:[{message:{content:line}}]})});
      expect((await call('test',input,fake)).data.source).toBe('local');
    }
    expect((await call('test',input,vi.fn().mockRejectedValue(new Error('timeout')))).data.source).toBe('local');
    expect((await call('test','{}')).status).toBe(400);
  });
});
