/* Plain local images also work in the isolated PDF renderer. */
export function BrandLogo({variant='dark',className=''}:{variant?:'dark'|'light'|'mark';className?:string}){
 const name=variant==='mark'?'monogram':'wordmark-'+variant;
 const dimensions=variant==='mark'?{width:192,height:196}:variant==='dark'?{width:900,height:298}:{width:900,height:294};
 return <img className={'brand-logo brand-'+variant+' '+className} src={'/branding/dayday-'+name+'.png'} alt="DayDay Inc." {...dimensions}/>;
}
