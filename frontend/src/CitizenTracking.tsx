import { useEffect, useState } from "react";
import { Alert, Button, Card, List, Pagination, Space, Tabs, Tag, Typography } from "antd";
import { api, date, statusNames } from "./api";
import CommunityDetail from "./CommunityDetail";
type D = Record<string,any>;
export default function CitizenTracking({ initialTab="mine", open }: {initialTab?:string;open:(id:string)=>void}) {
 const [tab,setTab]=useState(initialTab),[page,setPage]=useState(1),[revision,setRevision]=useState(0);
 const [data,setData]=useState<D>(),[error,setError]=useState(""),[busy,setBusy]=useState(false),[detail,setDetail]=useState<string>();
 useEffect(()=>{const c=new AbortController();setBusy(true);setError("");setData(undefined);
 api<D>(`/citizen/tracking?tab=${tab}&page=${page-1}`,{signal:c.signal}).then(setData).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setBusy(false);});return()=>c.abort();},[tab,page,revision]);
 return <><Typography.Title level={2}>ติดตามสถานะปัญหา</Typography.Title>
 <Tabs activeKey={tab} onChange={v=>{setTab(v);setPage(1);}} items={[{key:"mine",label:"เรื่องที่ฉันแจ้งเอง"},{key:"following",label:"เรื่องที่ฉันกดติดตาม"}]} />
 {error ? <Alert type="error" message={error} action={<Button onClick={()=>setRevision(v=>v+1)}>ลองใหม่</Button>}/> : <Card>
 <List loading={busy} dataSource={data?.items||[]} locale={{emptyText:busy?"กำลังโหลด…":"ยังไม่มีรายการในแท็บนี้"}} renderItem={(item:D)=><List.Item actions={[
 <Button key="detail" onClick={()=>tab==="mine"?open(item.id):setDetail(item.id)}>ดูรายละเอียด</Button>,
 ...(tab==="following"?[<Button key="remove" onClick={async()=>{try{await api(`/complaints/${item.id}/follow`,{method:"DELETE"});setPage(1);setRevision(v=>v+1);}catch(e){setError((e as Error).message);}}}>ยกเลิกการติดตาม</Button>]:[])
 ]}><List.Item.Meta title={item.category_name} description={<Space wrap><Tag>{statusNames[item.status]}</Tag><span>#{item.id.slice(0,8)} · {date(item.updated_at)}</span></Space>}/></List.Item>} />
 <Pagination current={page} pageSize={5} total={Number(data?.total||0)} showSizeChanger={false} onChange={setPage}/></Card>}
 <CommunityDetail id={detail} onClose={()=>setDetail(undefined)}/></>;
}
