import { useState } from 'react';
import { Alert, Button, Space } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { post } from './api';
import { govClient, useGovConfig } from './govSso';
export default function GovLogin({link=false}:{link?:boolean}){
 const {config,error:loadError}=useGovConfig();const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 if(!config?.configured)return !link&&(config?.mode==='central'||loadError)?<Alert type="warning" showIcon message={loadError||'ยังไม่ได้ตั้งค่า Gov Center SSO ครบถ้วน'}/>:null;
 async function start(){
  setBusy(true);setError('');
  try{
   if(new URL(config!.callbackUrl).origin!==window.location.origin)throw new Error('กรุณาเข้า TownTrack ด้วยโดเมนที่ลงทะเบียน SSO ไว้');
   const url=govClient(config!).getLoginUrl();const state=new URL(url).searchParams.get('state');
   await post('/auth/gov/start',{state,purpose:link?'LINK':'LOGIN'});
   window.location.assign(url);
  }catch(e){setError((e as Error).message);setBusy(false);}
 }
 return <Space direction="vertical" style={{width:link?'auto':'100%',marginTop:link?0:16}}>
  <Button block={!link} icon={<SafetyCertificateOutlined/>} loading={busy} onClick={()=>void start()}>{link?'เชื่อมบัญชี Gov Center':'เข้าสู่ระบบด้วย Gov Center'}</Button>
  {error&&<Alert type="error" showIcon message={error}/>}
 </Space>;
}
