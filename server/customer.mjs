import { orders } from '../src/core/orders.ts';

export function buildPrompt(index, grade) {
  const order=orders[index];
  return [
    {role:'system',content:'你扮演古代小县城的普通顾客。只谈眼前这件器物怎样用于你的日常，一人称一句口语，6至35个汉字。品质瑕疵要有委婉不满，合格是够用，精良要具体赞赏。不要编造人物、价钱、数字、剧情或对话标签。'},
    {role:'user',content:JSON.stringify({顾客:order.name,第几天:Math.floor(index/3)+1,订单:order.item,用途:order.use,交付品质:grade})}
  ];
}

export function customerApi(key, transport=fetch) {
  return async (req,res,next)=>{
    if(req.url?.split('?')[0]!=='/api/customer')return next();
    const send=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
    if(req.method!=='POST')return send(405,{source:'local'});
    try {
      if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)return send(403,{source:'local'});
      let body='';for await (const part of req){body+=part;if(body.length>512)return send(413,{source:'local'});}
      let input;try{input=JSON.parse(body);}catch{return send(400,{source:'local'});}
      const {index,grade}=input??{};
      if(![0,1,2,3,4,6,7].includes(index)||!['精良','合格','瑕疵'].includes(grade))return send(400,{source:'local'});
      if(!key)return send(200,{source:'local'});
      const response=await transport('https://kspmas.ksyun.com/v1/chat/completions',{
        method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},
        body:JSON.stringify({model:'mimo-v2.6-flash',messages:buildPrompt(index,grade),temperature:.75,max_tokens:96,thinking:{type:'disabled'}}),
        signal:AbortSignal.timeout(3400)
      });
      if(!response.ok)return send(200,{source:'local'});
      const data=await response.json();
      const line=data?.choices?.[0]?.message?.content?.trim().replace(/^[“「]|[”」]$/g,'');
      if(typeof line!=='string'||line.length<5||line.length>45||/[<>\n\d]|孙承安|预付|捕头|证据|账本|甲胄|替罪|跑路|银两|贿赂|主簿|官府|军器|老周|师傅/.test(line))return send(200,{source:'local'});
      send(200,{source:'model',line});
    }catch{send(200,{source:'local'});}
  };
}
