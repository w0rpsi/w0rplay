// Standalone D3D11 microbenchmark. Never opens a game, process handle, hook, window or swap chain.
#define NOMINMAX
#include <windows.h>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <d3dcompiler.h>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <vector>
#include <algorithm>
#include <cmath>
#include <cstring>
#include <string>
#include <iomanip>
#include <stdexcept>
static void ck(HRESULT h,const char* why){if(FAILED(h))throw std::runtime_error(std::string(why)+" HRESULT="+std::to_string((unsigned)h));}
struct Vertex{float x,y,z,nx,ny,nz,u,v;};
struct Model{ID3D11Buffer *vb=nullptr,*ib=nullptr;UINT indices=0,vertices=0;};
template<class T>void read(std::ifstream& f,T& v){f.read(reinterpret_cast<char*>(&v),sizeof(v));if(!f)throw std::runtime_error("truncated fixture");}
static void wait(ID3D11DeviceContext* c,ID3D11Asynchronous* q,void* data,UINT len){HRESULT h;while((h=c->GetData(q,data,len,0))==S_FALSE)Sleep(0);ck(h,"GetData");}
static const char* shader=R"HLSL(
Texture2D image:register(t0);SamplerState sampling:register(s0);
struct In{float3 p:POSITION;float3 n:NORMAL;float2 uv:TEXCOORD0;};
struct Out{float4 p:SV_POSITION;float3 n:NORMAL;float2 uv:TEXCOORD0;};
Out vs(In i){Out o;o.p=float4(-(i.p.z+.865)/(1.3*(2560.0/1440.0)*.5),(i.p.y+.03)/.65,.5+(-i.p.x-.958)*2,1);o.n=i.n;o.uv=i.uv;return o;}
float4 ps(Out i):SV_TARGET{float4 t=image.Sample(sampling,i.uv);clip(t.a-.5);float lit=.3+.7*abs(dot(normalize(i.n),normalize(float3(1,.2,.1))));return float4(t.rgb*.564706*lit,1);}
)HLSL";
int wmain(int argc,wchar_t**argv){try{
 if(argc!=3)throw std::runtime_error("scene.bin output-prefix required");
 IDXGIFactory1* factory=nullptr;ck(CreateDXGIFactory1(__uuidof(IDXGIFactory1),(void**)&factory),"DXGI factory");
 IDXGIAdapter1* adapter=nullptr;DXGI_ADAPTER_DESC1 desc{};
 for(UINT n=0;;n++){IDXGIAdapter1* a=nullptr;if(factory->EnumAdapters1(n,&a)==DXGI_ERROR_NOT_FOUND)break;DXGI_ADAPTER_DESC1 d{};a->GetDesc1(&d);if(d.VendorId==0x10de && !(d.Flags&DXGI_ADAPTER_FLAG_SOFTWARE)){adapter=a;desc=d;break;}a->Release();}
 if(!adapter)throw std::runtime_error("NVIDIA adapter missing; benchmark refuses software fallback");
 ID3D11Device* device=nullptr;ID3D11DeviceContext* ctx=nullptr;D3D_FEATURE_LEVEL level;
 ck(D3D11CreateDevice(adapter,D3D_DRIVER_TYPE_UNKNOWN,nullptr,0,nullptr,0,D3D11_SDK_VERSION,&device,&level,&ctx),"D3D device");
 char adapterName[256]{};WideCharToMultiByte(CP_UTF8,0,desc.Description,-1,adapterName,sizeof(adapterName),nullptr,nullptr);
 std::cout<<"Adapter: "<<adapterName<<"; VendorId="<<std::hex<<desc.VendorId<<" DeviceId="<<desc.DeviceId<<std::dec<<"; feature-level="<<std::hex<<(unsigned)level<<std::dec<<"\n";
 std::ifstream f(std::filesystem::path(argv[1]),std::ios::binary);UINT count;read(f,count);if(count!=2)throw std::runtime_error("expected two models");std::vector<Model> models(count);
 for(auto&m:models){read(f,m.vertices);read(f,m.indices);std::vector<Vertex> v(m.vertices);std::vector<UINT> i(m.indices);f.read((char*)v.data(),v.size()*sizeof(Vertex));f.read((char*)i.data(),i.size()*4);D3D11_BUFFER_DESC b{};b.Usage=D3D11_USAGE_IMMUTABLE;b.BindFlags=D3D11_BIND_VERTEX_BUFFER;b.ByteWidth=v.size()*sizeof(Vertex);D3D11_SUBRESOURCE_DATA d{v.data(),0,0};ck(device->CreateBuffer(&b,&d,&m.vb),"vertices");b.BindFlags=D3D11_BIND_INDEX_BUFFER;b.ByteWidth=i.size()*4;d.pSysMem=i.data();ck(device->CreateBuffer(&b,&d,&m.ib),"indices");}
 std::vector<ID3D11ShaderResourceView*> textures;
 for(int n=0;n<3;n++){UINT w,h;read(f,w);read(f,h);std::vector<BYTE> p(w*h*4);f.read((char*)p.data(),p.size());if(!f)throw std::runtime_error("truncated texture");D3D11_TEXTURE2D_DESC td{};td.Width=w;td.Height=h;td.MipLevels=td.ArraySize=1;td.Format=DXGI_FORMAT_R8G8B8A8_UNORM_SRGB;td.SampleDesc.Count=1;td.Usage=D3D11_USAGE_IMMUTABLE;td.BindFlags=D3D11_BIND_SHADER_RESOURCE;D3D11_SUBRESOURCE_DATA init{p.data(),w*4,0};ID3D11Texture2D*t=nullptr;ck(device->CreateTexture2D(&td,&init,&t),"texture");ID3D11ShaderResourceView*srv=nullptr;ck(device->CreateShaderResourceView(t,nullptr,&srv),"texture view");textures.push_back(srv);t->Release();}
 ID3DBlob *vscode=nullptr,*pscode=nullptr,*err=nullptr;
 auto compile=[&](const char* entry,const char* profile,ID3DBlob**b){HRESULT h=D3DCompile(shader,strlen(shader),nullptr,nullptr,nullptr,entry,profile,D3DCOMPILE_OPTIMIZATION_LEVEL3,0,b,&err);if(FAILED(h)){if(err)std::cerr<<(char*)err->GetBufferPointer();ck(h,"compile");}};compile("vs","vs_5_0",&vscode);compile("ps","ps_5_0",&pscode);
 ID3D11VertexShader*vs=nullptr;ID3D11PixelShader*ps=nullptr;ck(device->CreateVertexShader(vscode->GetBufferPointer(),vscode->GetBufferSize(),nullptr,&vs),"VS");ck(device->CreatePixelShader(pscode->GetBufferPointer(),pscode->GetBufferSize(),nullptr,&ps),"PS");
 D3D11_INPUT_ELEMENT_DESC elements[]={{"POSITION",0,DXGI_FORMAT_R32G32B32_FLOAT,0,0,D3D11_INPUT_PER_VERTEX_DATA,0},{"NORMAL",0,DXGI_FORMAT_R32G32B32_FLOAT,0,12,D3D11_INPUT_PER_VERTEX_DATA,0},{"TEXCOORD",0,DXGI_FORMAT_R32G32_FLOAT,0,24,D3D11_INPUT_PER_VERTEX_DATA,0}};ID3D11InputLayout*layout=nullptr;ck(device->CreateInputLayout(elements,3,vscode->GetBufferPointer(),vscode->GetBufferSize(),&layout),"layout");
 D3D11_TEXTURE2D_DESC td{};td.Width=2560;td.Height=1440;td.MipLevels=td.ArraySize=td.SampleDesc.Count=1;td.Format=DXGI_FORMAT_R8G8B8A8_UNORM_SRGB;td.BindFlags=D3D11_BIND_RENDER_TARGET;ID3D11Texture2D*target=nullptr;ck(device->CreateTexture2D(&td,nullptr,&target),"target");ID3D11RenderTargetView*rtv=nullptr;D3D11_RENDER_TARGET_VIEW_DESC rv{};rv.Format=DXGI_FORMAT_R8G8B8A8_UNORM_SRGB;rv.ViewDimension=D3D11_RTV_DIMENSION_TEXTURE2D;ck(device->CreateRenderTargetView(target,&rv,&rtv),"RTV");td.Format=DXGI_FORMAT_D32_FLOAT;td.BindFlags=D3D11_BIND_DEPTH_STENCIL;ID3D11Texture2D*depth=nullptr;ck(device->CreateTexture2D(&td,nullptr,&depth),"depth");ID3D11DepthStencilView*dsv=nullptr;ck(device->CreateDepthStencilView(depth,nullptr,&dsv),"DSV");
 D3D11_RASTERIZER_DESC raster{};raster.FillMode=D3D11_FILL_SOLID;raster.CullMode=D3D11_CULL_BACK;raster.DepthClipEnable=TRUE;ID3D11RasterizerState*rs=nullptr;ck(device->CreateRasterizerState(&raster,&rs),"raster");D3D11_DEPTH_STENCIL_DESC ds{};ds.DepthEnable=TRUE;ds.DepthWriteMask=D3D11_DEPTH_WRITE_MASK_ALL;ds.DepthFunc=D3D11_COMPARISON_LESS_EQUAL;ID3D11DepthStencilState*dss=nullptr;ck(device->CreateDepthStencilState(&ds,&dss),"depth state");D3D11_SAMPLER_DESC sd{};sd.Filter=D3D11_FILTER_MIN_MAG_MIP_LINEAR;sd.AddressU=sd.AddressV=sd.AddressW=D3D11_TEXTURE_ADDRESS_CLAMP;sd.MaxLOD=D3D11_FLOAT32_MAX;ID3D11SamplerState*sampler=nullptr;ck(device->CreateSamplerState(&sd,&sampler),"sampler");
 ctx->IASetInputLayout(layout);ctx->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);ctx->VSSetShader(vs,nullptr,0);ctx->PSSetShader(ps,nullptr,0);ctx->PSSetSamplers(0,1,&sampler);ctx->OMSetRenderTargets(1,&rtv,dsv);ctx->OMSetDepthStencilState(dss,0);ctx->RSSetState(rs);D3D11_VIEWPORT viewport{0,0,2560,1440,0,1};ctx->RSSetViewports(1,&viewport);
 auto draw=[&](const Model&m){float clear[4]={.02f,.025f,.03f,1};ctx->ClearRenderTargetView(rtv,clear);ctx->ClearDepthStencilView(dsv,D3D11_CLEAR_DEPTH,1,0);ctx->DrawIndexed(m.indices,0,0);};
 ID3D11Query *disjoint=nullptr,*start=nullptr,*end=nullptr,*stats=nullptr;D3D11_QUERY_DESC qd{D3D11_QUERY_TIMESTAMP_DISJOINT,0};ck(device->CreateQuery(&qd,&disjoint),"query");qd.Query=D3D11_QUERY_TIMESTAMP;ck(device->CreateQuery(&qd,&start),"query");ck(device->CreateQuery(&qd,&end),"query");qd.Query=D3D11_QUERY_PIPELINE_STATISTICS;ck(device->CreateQuery(&qd,&stats),"stats");
 {auto&m=models[1];UINT stride=sizeof(Vertex),offset=0;ctx->IASetVertexBuffers(0,1,&m.vb,&stride,&offset);ctx->IASetIndexBuffer(m.ib,DXGI_FORMAT_R32_UINT,0);ctx->PSSetShaderResources(0,1,&textures[1]);for(int n=0;n<2400;n++)draw(m);ctx->Flush();}
 const char* names[]={"original_static","atlas_pose0_open","atlas_pose15_closed"};std::cout<<"Resolution: 2560x1440; warmup=2400 atlas frames plus60 frames per case; samples=120; frames-per-sample=32; includes clears+one draw; no MSAA\n";
 for(int caseIndex=0;caseIndex<3;caseIndex++){auto&m=models[caseIndex?1:0];UINT stride=sizeof(Vertex),offset=0;ctx->IASetVertexBuffers(0,1,&m.vb,&stride,&offset);ctx->IASetIndexBuffer(m.ib,DXGI_FORMAT_R32_UINT,0);ctx->PSSetShaderResources(0,1,&textures[caseIndex]);for(int w=0;w<60;w++)draw(m);ctx->Flush();std::vector<double> times;
  for(int sample=0;sample<120;sample++){ctx->Begin(disjoint);ctx->End(start);for(int frame=0;frame<32;frame++)draw(m);ctx->End(end);ctx->End(disjoint);ctx->Flush();D3D11_QUERY_DATA_TIMESTAMP_DISJOINT d{};UINT64 a,b;wait(ctx,disjoint,&d,sizeof(d));wait(ctx,start,&a,sizeof(a));wait(ctx,end,&b,sizeof(b));if(!d.Disjoint)times.push_back((b-a)*1000.0/d.Frequency/32);}
  ctx->Begin(stats);draw(m);ctx->End(stats);ctx->Flush();D3D11_QUERY_DATA_PIPELINE_STATISTICS s{};wait(ctx,stats,&s,sizeof(s));
  std::sort(times.begin(),times.end());if(times.empty())throw std::runtime_error("all timestamps disjoint");double mean=0;for(double t:times)mean+=t;mean/=times.size();std::cout<<std::fixed<<std::setprecision(6)<<names[caseIndex]<<": mean_ms="<<mean<<" median_ms="<<times[times.size()/2]<<" p95_ms="<<times[(times.size()*95)/100]<<" valid_samples="<<times.size()<<" triangles="<<m.indices/3<<" PSInvocations="<<s.PSInvocations<<" VSInvocations="<<s.VSInvocations<<"\n";
  // Save one GPU-rendered frame for visual validation, not a performance measurement.
  D3D11_TEXTURE2D_DESC rd{};target->GetDesc(&rd);rd.Usage=D3D11_USAGE_STAGING;rd.BindFlags=0;rd.CPUAccessFlags=D3D11_CPU_ACCESS_READ;ID3D11Texture2D*readback=nullptr;ck(device->CreateTexture2D(&rd,nullptr,&readback),"readback");ctx->CopyResource(readback,target);D3D11_MAPPED_SUBRESOURCE mapped{};ck(ctx->Map(readback,0,D3D11_MAP_READ,0,&mapped),"readback map");std::filesystem::path file=std::filesystem::path(std::wstring(argv[2])+L"-"+std::to_wstring(caseIndex)+L".rgba");std::ofstream capture(file,std::ios::binary);for(UINT y=0;y<1440;y++)capture.write((char*)mapped.pData+y*mapped.RowPitch,2560*4);ctx->Unmap(readback,0);readback->Release();
 }
 std::cout<<"This is a GPU microbenchmark, not ETS2 shader cost or game FPS.\n";return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<"\n";return 1;}}
