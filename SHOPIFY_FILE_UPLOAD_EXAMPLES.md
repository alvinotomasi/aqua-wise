# Shopify File Upload Examples

## Basic File Upload (No Filename)

This is what we use for Airtable URLs without extensions:

```bash
curl -X POST \
  "https://YOUR-STORE.myshopify.com/admin/api/2024-07/graphql.json" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: YOUR_ACCESS``
c.js
`t-synuc-prodeste t
nod```basht:

tesjs Node. use the ``

Orile.pdf"
`r-f/youmple.com://exahttpssh "to-shopify.load-file-up
./```bashpt:

ided scrise the provoad

Uplng Your U## Testi

es

--- 429 responsts, handlete limiI ras APfy ha* - Shopilimits*5. **Rate e
he responsErrors` in tcheck `user* - Always ng*r handlirro
4. **Eloadfter upk status ahecously, css asynchronoce* - Files pr processing*
3. **Async` for images, `"IMAGE"ocumentsor d"` fUse `"FILEntType** - **conteld
2. ilename fie fomit thens, so ave extensioThey don't h URLs** - rtablename for Ai**No file.  Points

1Key
## 
---
i
```
1
f  exit rors'
erEruseate.ta.fileCr | jq '.daESPONSE"  echo "$Rd failed"
ho "✗ Uploalse
  ec_URL"
eLE"URL: $FI
  echo STATUS"FILE_"Status: $ echo l')
  
 ata.node.ur| jq -r '.d" S_RESPONSEo "$STATUch_URL=$(e)
  FILE.fileStatus'.data.node -r 'jqSPONSE" | TUS_RESTAS=$(echo "$TU
  FILE_STAEOF
  )
  
  }
}
D}"${FILE_I"id": "": {
    les
  "variab",s } } }leStatu id url fiFile {on Genericid) { ... \$id:  node() {d: ID!\$iery getFile(": "quy"quer
{
  EOFd @- <<  \
    -_TOKEN}"HOPIFYs-Token: ${Sify-AccesopH "X-Sh
    -\n" json/licatiot-Type: appten   -H "Con
 json" \graphql.24-07/i/20N}/admin/apDOMAIPIFY_ps://${SHO  "htt \
  -s -X POSTNSE=$(curl RESPOTATUS_
  SstatusCheck 5
  
  # 
  sleep .." process.e tong for fil "Waiti  echoocessing
 prorWait f# "
  
  E_IDloaded: $FIL File up"✓en
  echo  thID" ];n "$FILE_ && [ -ll" ] "nuLE_ID" !=f [ "$FI

i].id')es[0Create.filta.file '.daq -rPONSE" | jRESD=$(echo "$e ID
FILE_Iract fil
)

# Ext}
EOF    ]
  }
     }
LE"
 ": "FIntType    "conteL}",
    E_URe": "${FILalSourcigin"or          {
  : [
  iles"   "f: {
 variables"",
  sage } } }"es m { userErrors { id }s) { filess: \$fileeate(file!) { fileCrnput!]leCreateI [Fi$files:leCreate(\mutation fiuery": ""q
  
{@- << EOF\
  -d KEN}" HOPIFY_TO{S: $enccess-Tokpify-AShoH "X-" \
  -/jsonapplicationtent-Type: H "Con\
  -n" raphql.jso07/gpi/2024-/aIN}/admin_DOMASHOPIFY"https://${
  OST \rl -s -X Pcu
RESPONSE=$( file

# Upload."Shopify..to ing file load
echo "Upnt.pdf"
m/docume.coleps://exampRL="htt_UILE"
Fxxxshpat_xxEN="OPIFY_TOKSHm"
yshopify.core.mto"your-sIN=_DOMAion
SHOPIFYguratonfie

# Cet -sh
sh
#!/bin/ba```bas Example

orkingmplete W

## Co
---fi
```
$FILE_ID"
lly: ssfuaded succe File uploho "✓.id')
  ec0]iles[eCreate.f'.data.fil | jq -r NSE"SPOREo "$D=$(ech  FILE_Ielse

  exit 1
rrors'te.userEeaa.fileCrat | jq '.dSPONSE"ho "$REile:"
  ecding fploa"Error uo  echll; then
 v/nu> /delength > 0' rs | serErro.ufileCreate.data." | jq -e 'ESPONSEf echo "$R errors
ik for
# Chec')

    }
  }
      ]}"
        nt.pdfcume": "doamelen  "fi     LE",
    "FIpe":tentTy   "con     .pdf",
  ple.com/file://exame": "httpsurcginalSo     "ori       {
   
   les": [      "fi: {
ariables",
    "v } } }"age field messErrors {id } user { files { s: $files)eCreate(fileil!) { ft!]npuleCreateIles: [Fi$fieCreate(tion filmutay": "uer "q-d '{
   
  _TOKEN}" \CESSACDMIN_HOPIFY_A{Sess-Token: $hopify-Acc -H "X-S\
 n" ation/jsoType: applicContent- "" \
  -Hphql.json7/grai/2024-0apMAIN}/admin/ORE_DO_ST://${SHOPIFY"https \
  STl -s -X POurESPONSE=$(cash
Rple

```bamndling ExError Ha

## ```

---jq .
  }
  }' |   
 }
      ]    ILE"
   Type": "Fent"cont         t.pdf",
 .com/documenle/examphttps:/e": "iginalSourc      "or
    
        {iles": [
      "fbles": {"varia     } }",
age }ors { messErr usermeType } mi url{ idfiles les) {  $fifiles:leCreate(!) { fi!]eInputileCreatles: [FfieCreate($fil"mutation "query":     -d '{
\
  OKEN}" SS_TACCEIFY_ADMIN_oken: ${SHOP-Access-TShopify
  -H "X-\json" n/licatioe: appnt-Typ -H "Conte\
 " hql.jsonap2024-07/gr/admin/api/E_DOMAIN}OPIFY_STOR://${SHps
  "httl -X POST \bash
curh jq

``` witnse Respo Print Pretty
---

##
```
 }
  }'   ]
          }
    "FILE"
ype": "contentT     df",
     anty.pwarre.com/xampl"https://eurce": "originalSo
                 {   },
      E"
 "FILntentType":        "cos.pdf",
  m/spec.cople//exam: "https:ource"nalSorigi   "{
               },
        "FILE"
": tTypeconten "        
 .pdf",nual.com/ma//example "https:e":rcoriginalSou    "   {
      
     : [ "files"
     s": {"variable    }",
  message } }rrors {rE} useiles { id ) { ffiles $reate(files:]!) { fileCeInput!at [FileCrete($files:leCreamutation fiuery": "    "q
\
  -d '{TOKEN" SS_R_ACCEen: YOUokfy-Access-TX-Shopi\
  -H "on" tion/jsapplicantent-Type: 
  -H "Coson" \aphql.jgri/2024-07/com/admin/apyshopify.R-STORE.mttps://YOU\
  "h -X POST ash
curl

```b FilesMultipled atch Uploa B--

##`

-}
  }'
``
         ]     }
 E"
   ILype": "FontentT   "c",
       /file.pdfxample.com "https://ealSource":in      "orig
            { [
iles":     "f": {
 bles"varia
    e } } }",s { messagserError } ufiles { idfiles) { iles: $Create(f { fileut!]!)eInp: [FileCreatlesfireate($eCutation fil "mery":
    "qu
  -d '{_TOKEN}" \MIN_ACCESS{SHOPIFY_ADken: $ess-To-Shopify-Acc\
  -H "X/json" licationappype: tent-Ton"C \
  -H "on.jsraphql24-07/gin/api/20/admDOMAIN}TORE_HOPIFY_Sps://${Shtt"\
  OST e
curl -X P filload

# Upat_xxxxx"shpEN="_ACCESS_TOKINPIFY_ADM
export SHOopify.com"r-store.myshyouIN="OMATORE_Dt SHOPIFY_S
exporialsr credentyou# Set `bash
les

``abriment Va Environ

## Using

---'
```
    }
  }R_FILE_ID"le/YOUicFierhopify/Gen/s"gid:/   "id": es": {
   variabl,
    "} } }"e message } ors { codErrStatus fileSize fileginalFileril mimeType oe { id urFilGeneric ... on d) {ode(id: $i ID!) { n$id:etFile(": "query g   "query{
 \
  -d 'N" S_TOKEYOUR_ACCESss-Token: opify-Acce
  -H "X-Shn" \lication/jso-Type: appontent-H "Cson" \
  aphql.jgr7/2024-0/api/y.com/admin.myshopifYOUR-STORE://tpsT \
  "ht
curl -X POSsh```baready:

e is if the filing, check fter upload

A Statusle## Check Fi


---}'
```

    }
   ]
           }"
  Image"Product   "alt":       
  ",MAGEpe": "IntentTy   "co  pg",
     com/image.js://example. "http":alSource "origin            {
    iles": [
   "f    les": {
iab   "var",
  } }ge } field messaors { userErrreatedAt } caltes { id s) { fil $fileeate(files:eCr!) { fileateInput!]leCres: [Fiate($filileCreutation fery": "m
    "qu -d '{\
 TOKEN" SS_CEken: YOUR_ACss-To-Acce"X-Shopify  -H 
" \on/jsonlicati-Type: apptent  -H "Con\
ql.json" phgra2024-07/admin/api/om/pify.cE.myshoTORYOUR-S://"https \
   -X POSTash
curlload

```bmage Up--

## I
```

-  }' ]
    }
}
            Manual"
 ation nstall"Product I "alt":         ",
 fanual.pdroduct-mme": "p    "filena,
       "FILE"ntType":"conte          .pdf",
com/document//example.: "https:nalSource" "origi       {
   [
        s":      "fileables": {
ari"v }",
   ssage } } d me{ fielErrors edAt } user creates { id alt) { fil$filesiles: (ffileCreate!]!) { reateInput[FileCte($files: eaeCrfilutation uery": "m
    "q '{ -dOKEN" \
 UR_ACCESS_Tss-Token: YOpify-Acce-Sho\
  -H "Xon/json" e: applicatit-Typnten"Co \
  -H.json" ql24-07/graphmin/api/20pify.com/adhoRE.mys://YOUR-STO\
  "httpsOST h
curl -X P
```baslt Text
ad with A Uplo

## Fileion

---xtenss `.pdf` epe if URL haontent-Tyith proper Cds woauplt:** File sul
**Re }'
```
 }
      ]
      }
     ent.pdf"
 ocume": "dfilenam"  
        ",pe": "FILEtTyconten        ".pdf",
  ument/docmple.comttps://exae": "hriginalSourc     "o
     [
        {iles":     "fes": {
     "variabl",
  }sage } } { field mesrsrroAt } userElt createds { id ailes) { filee(files: $fCreat!]!) { fileCreateInput [Filees:ate($filn fileCremutatioery": ""qud '{
    
  -_TOKEN" \CESSACn: YOUR_-Tokeessify-Accop -H "X-Shn" \
 n/jsoapplicatioent-Type: H "Contn" \
  -graphql.jso/2024-07/dmin/apiify.com/ahop-STORE.myshttps://YOUR" \
   -X POSTrlcuash
``b

`n)xtensioas e if URL h (Only worksname with File File Upload--

##stream`

-ctet-tion/os `applicay, served a successfulle uploads:** FilResult

**
``` }']
    }
 
      }      "
  : "FILEpe"tTy   "conten",
       ile/.../f61926400000/1746/46t.com/v3/u/onteneuserc//v5.airtabl": "https:lSource "origina        {
     [
     files":      "ables": {
ari  "v} }",
  e } field messagors { t } userErratedAalt creiles { id iles) { files: $fileCreate(fnput!]!) { fCreateIiles: [FileCreate($futation file"m"query": '{
    
  -d EN" \_TOK