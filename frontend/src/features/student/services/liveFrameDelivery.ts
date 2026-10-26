export interface LiveFrame { jpeg:string;audioPcm16:string }
export interface LiveTurn { lease:number;epoch?:number }
export interface LiveDeliveryOptions {
  current:()=>LiveTurn|undefined;
  capture:()=>Promise<LiveFrame>;
  send:(turn:LiveTurn,frame:LiveFrame)=>Promise<unknown>;
}

/** No camera encoding outside a current, connected turn. Never queue old frames. */
export class LiveFrameDelivery {
  private busy=false;
  private retryAt=0;
  private failures=0;
  private clock:()=>number;
  constructor(clock=Date.now){this.clock=clock;}
  async run(options:LiveDeliveryOptions):Promise<'idle'|'stale'|'sent'|'failed'>{
    if(this.busy||this.clock()<this.retryAt)return 'idle';
    const turn=options.current();if(!turn)return 'idle';
    this.busy=true;
    try{
      const frame=await options.capture();
      // Asynchronous encoding can finish after disconnect, turn rotation or cleanup.
      const current=options.current();
      if(current?.lease!==turn.lease||current.epoch!==turn.epoch)return 'stale';
      await options.send(turn,frame);
      this.failures=0;this.retryAt=0;return 'sent';
    }catch{
      this.retryAt=this.clock()+Math.min(15000,1000*2**Math.min(this.failures++,4));
      return 'failed';
    }finally{this.busy=false;}
  }
}
