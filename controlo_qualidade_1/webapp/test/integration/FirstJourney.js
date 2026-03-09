sap.ui.define([
    "sap/ui/test/opaQunit",
    "./pages/JourneyRunner"
], function (opaTest, runner) {
    "use strict";

    function journey() {
        QUnit.module("First journey");

        opaTest("Start application", function (Given, When, Then) {
            Given.iStartMyApp();

            Then.onTheCQCabList.iSeeThisPage();
            Then.onTheCQCabList.onFilterBar().iCheckFilterField("Centro");
            Then.onTheCQCabList.onFilterBar().iCheckFilterField("ID Controlo Qualidad");
            Then.onTheCQCabList.onFilterBar().iCheckFilterField("CQ Tipo Documento");
            Then.onTheCQCabList.onFilterBar().iCheckFilterField("Material");
            Then.onTheCQCabList.onFilterBar().iCheckFilterField("Lote");
            Then.onTheCQCabList.onFilterBar().iCheckFilterField("Status");
            Then.onTheCQCabList.onFilterBar().iCheckFilterField("CQ Documento");
            Then.onTheCQCabList.onFilterBar().iCheckFilterField("NCV");
            Then.onTheCQCabList.onTable().iCheckColumns(90, {"Centro":{"header":"Centro"},"ID":{"header":"ID Controlo Qualidad"},"Estado":{"header":"Status"},"Tipodoc":{"header":"CQ Tipo Documento"},"Documento":{"header":"CQ Documento"},"Material":{"header":"Material"},"Lote":{"header":"Lote"},"DtCongelacao":{"header":"Data Congelação"},"DtVencimento":{"header":"Data do vencimento"},"Tipoprod":{"header":"CQ Tipo Produto"},"Vntipo":{"header":"Tipo Tabela"},"Grupopais":{"header":"Grupo Países"},"Contertorselado":{"header":"Contentor Selado"},"Contertoraberto":{"header":"Contentor Aberto na Alfândega"},"RepQual":{"header":"Report Qualidade"},"LinkLotes":{"header":"Lote Details"},"CarregaDet":{"header":"Detalhes Carregamento"},"Selo":{"header":"Selo"},"Entreposto":{"header":"Entreposto"},"Nexportador":{"header":"NCV"},"Tempveiculo":{"header":"Temperatura Veículo"},"Tempproduto":{"header":"Temperatura Produto"},"Veiculohigienizado":{"header":"Veículo Higienizado"},"Precozinhado":{"header":"Pré-cozinhado"},"Iddatalogger":{"header":"ID Data Logger"},"Datalogger":{"header":"Data Logger ?"},"Dataloggerestado":{"header":"Data Logger Estado"},"Nc":{"header":"Não Conformidade"},"NomeTransportador":{"header":"Nome Transportador"},"Matricula":{"header":"Matricula"},"Cmr":{"header":"CMR"},"MMGtin":{"header":"MM Gtin"},"Ean":{"header":"Ean"},"Gtin":{"header":"Gtin"},"Tipoproduto":{"header":"Tipo de Produto"},"Nembalporcaixa":{"header":"Unidades"},"Apresentacao":{"header":"Apres./ Emba. Prim."},"Pmscx":{"header":"PMS Cx"},"CalibreAprox":{"header":"Calibre Aproximado"},"Cxcomprimento":{"header":"Comprimento"},"Cxlargura":{"header":"Largura"},"Cxaltura":{"header":"Altura"},"Cxpesobruto":{"header":"CX Peso Bruto"},"Cxpesoliquido":{"header":"CX PL"},"Cxpesoliquidoesc":{"header":"CX PLE"},"Cxtara":{"header":"Tara Caixa"},"Uncomprimento":{"header":"Comprimento"},"Unlargura":{"header":"Largura"},"Unaltura":{"header":"Altura"},"Unpesobruto":{"header":"UN Peso Bruto"},"Unpesoliquido":{"header":"UN PL"},"Unpesoliquidoesc":{"header":"UN PLE"},"Untara":{"header":"Tara UN"},"Matcertificado":{"header":"Certificado"},"Mscaprov":{"header":"MSC Certificado"},"NumViveiro":{"header":"Nº Viveiro"},"LocalAbate":{"header":"Local de Abate"},"DataAbate":{"header":"Data de Abate"},"Veterinario":{"header":"Est. Veterinário"},"Ascaprov":{"header":"ASC Certificado"},"CodigoBarras":{"header":"Codigo Barras"},"MMEan":{"header":"MM Ean"},"Marca":{"header":"Marca"},"CAlhalal":{"header":"Halal"},"Origem":{"header":"Origem"},"PP":{"header":"PP"},"Zonadecaptura":{"header":"Zona de Captura"},"SGluten":{"header":"Sem Glúten"},"Artepesca":{"header":"Arte de Pesca"},"Zidiomapadrao":{"header":"Idioma Padrão Mat"},"Nomecientifico":{"header":"Nome Cientifico"},"Tipospeso":{"header":"Peso"},"Tipopesoliq":{"header":"Tipo Peso Liq."},"Calibre":{"header":"UN Tam./Ca."},"Calibremin":{"header":"Tam./Cal. Mínimo"},"Calibreminmed":{"header":"Calibre Medida"},"Calibremax":{"header":"Tam./Cal. Máximo"},"Tipocaptura":{"header":"Tipos de Captura"},"Teorvidragem":{"header":"Teor de Vidragem"},"VidragemM":{"header":"Vidragem M."},"Usercriacao":{"header":"Responsável"},"Datacriacao":{"header":"Criado em"},"Horacriacao":{"header":"Hora Criação"},"Usermodific":{"header":"User Modificação"},"Datamodific":{"header":"Modificado em"},"Horamodific":{"header":"Hora Modificação"},"Userfecho":{"header":"User Fecho"},"Datafecho":{"header":"Fechado em"},"Horafecho":{"header":"Hora Fecho"},"Contentor":{"header":"Contentor"}});

        });


        opaTest("Navigate to ObjectPage", function (Given, When, Then) {
            // Note: this test will fail if the ListReport page doesn't show any data
            
            When.onTheCQCabList.onFilterBar().iExecuteSearch();
            
            Then.onTheCQCabList.onTable().iCheckRows();

            When.onTheCQCabList.onTable().iPressRow(0);
            Then.onTheCQCabObjectPage.iSeeThisPage();

        });

        opaTest("Teardown", function (Given, When, Then) { 
            // Cleanup
            Given.iTearDownMyApp();
        });
    }

    runner.run([journey]);
});