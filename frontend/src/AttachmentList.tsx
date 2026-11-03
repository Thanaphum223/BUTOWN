import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { Alert, Button, Empty, Modal, Space, Spin, Typography } from "antd";
import { DownloadOutlined, EyeOutlined, FilePdfOutlined, PaperClipOutlined } from "@ant-design/icons";
const PdfPreview=lazy(()=>import("./PdfPreview"));
type D=Record<string,any>;
class PdfLoadBoundary extends Component<{file:D;onClose:()=>void;children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<Modal open title="เปิดเอกสาร" onCancel={this.props.onClose} footer={
    <Button href={`/api/files/${this.props.file.id}`} icon={<DownloadOutlined/>}>ดาวน์โหลดเอกสารต้นฉบับ</Button>}>
    <Alert type="error" message="เปิดโปรแกรมอ่านเอกสารไม่ได้ กรุณาดาวน์โหลดต้นฉบับเพื่ออ่านด้วยแอป PDF"/>
  </Modal>:this.props.children;}
}
export default function AttachmentList({files=[],emptyText="ยังไม่มีเอกสารแนบ",extraActions}:{files?:D[];emptyText?:string;extraActions?:(file:D)=>ReactNode}) {
  const [preview,setPreview]=useState<D>();
  return <>
    {!files.length?<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText}/>:<div className="attachment-list">
      {files.map(file=>{
        const pdf=file.content_type?file.content_type==="application/pdf":/\.pdf$/i.test(file.original_name);
        return <div className="attachment-row" key={file.id}>
          <div className="attachment-name">{pdf?<FilePdfOutlined/>:<PaperClipOutlined/>}<div><Typography.Text strong>{file.original_name}</Typography.Text><br/>
            <Typography.Text type="secondary">{(Number(file.size_bytes)/1_000_000).toLocaleString("th-TH",{maximumFractionDigits:2})} MB</Typography.Text></div></div>
          <Space wrap>{pdf&&<Button icon={<EyeOutlined/>} onClick={()=>setPreview(file)}>ดูเอกสาร</Button>}
            <Button icon={<DownloadOutlined/>} href={`/api/files/${file.id}`}>ดาวน์โหลด</Button>{extraActions?.(file)}</Space>
        </div>;
      })}
    </div>}
    {preview&&<PdfLoadBoundary key={preview.id} file={preview} onClose={()=>setPreview(undefined)}><Suspense fallback={<Modal open title="กำลังเปิดเอกสาร" onCancel={()=>setPreview(undefined)} footer={null}><Spin/></Modal>}><PdfPreview key={preview.id} file={preview as {id:string;original_name:string;size_bytes:number}} onClose={()=>setPreview(undefined)}/></Suspense></PdfLoadBoundary>}
  </>;
}
