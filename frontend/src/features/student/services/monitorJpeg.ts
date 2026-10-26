/** Keep JPEG compression asynchronous, preserving the live model's size / quality limits. */
export async function monitorJpeg(canvas:HTMLCanvasElement,onEncoded?:(duration:number)=>void):Promise<string>{
  const started=performance.now();
  try{
  for(const quality of [.9,.8,.7,.6]){
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
    if(!blob)throw new Error('Không chụp được ảnh camera.');
    if(blob.size>250000)continue;
    return await new Promise<string>((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result).split(',')[1]);
      reader.onerror=()=>reject(new Error('Không đọc được ảnh camera.'));
      reader.readAsDataURL(blob);
    });
  }
  throw new Error('Ảnh camera vượt giới hạn dung lượng.');
  }finally{onEncoded?.(performance.now()-started);}
}
