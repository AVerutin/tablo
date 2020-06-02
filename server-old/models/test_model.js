// const sql = require('mssql');
// const config = require('config');
//
// let s350Queries = {
// // Получение списка прокатываемых профилей за выбранный промежуток времени
//     getProfiles: "CREATE TABLE #shift (\n" +
//         "    [Id] [numeric](9, 0) IDENTITY(1,1) NOT NULL, \n" +
//         "    [Size] [nvarchar](50) NULL, \n" +
//         "    [Weight] [int] NULL, \n" +
//         "    [DataWeight] [datetime] NULL);\n" +
//         "INSERT INTO #shift ([Size], [Weight], [DataWeight]) \n" +
//         "SELECT \n" +
//         "    [AllPack].[Size],\n" +
//         "    [AllPack].[Weight],\n" +
//         "    [AllPack].[DataWeight]\n" +
//         "FROM [L2Mill].[dbo].[AllPack]\n" +
//         "WHERE [AllPack].[DataWeight] BETWEEN @startTS AND @finishTS\n" +
//         "-- WHERE [AllPack].[DataWeight] BETWEEN '2020-05-21 08:00:00' AND '2020-05-21 19:59:59'\n" +
//         "ORDER BY [AllPack].[DataWeight] ASC;\n" +
//         "\n" +
//         "SELECT\n" +
//         "    [Size] as [Size],\n" +
//         "    SUM([Weight]) as [Weight],\n" +
//         "    MIN([DataWeight]) as [Start],\n" +
//         "    MAX([DataWeight]) as [Finish]\n" +
//         "FROM #shift\n" +
//         "GROUP BY [Size]\n" +
//         "ORDER BY [Start] ASC;\n" +
//         "\n" +
//         "DROP TABLE #shift;"
// }
//
//
// let s350 = new sql.ConnectionPool(config.get("s350"), (err) => {
//     if (err)
//         throw (err);
// });
//
//
// const testModel = {
//
// //     getProfiles: async function() {
// //         // await s350.connect(err => {
// //         //     if(err){
// //         //         throw err ;
// //         //     }
// //         //     console.log("Connection Successful !");
// //         // });
// //         let data = [
// //             {
// //                 Profile: "",
// //                 Size: 0,
// //                 Weight: 0,
// //                 StartTs: 0,
// //                 FinishTs: 0
// //             },
// //             {
// //                 Profile: "",
// //                 Size: 0,
// //                 Weight: 0,
// //                 StartTs: 0,
// //                 FinishTs: 0
// //             }
// //         ]
// //         const today = new Date();
// //         const yyyy = today.getFullYear();
// //         const mn = today.getMonth() + 1;
// //         const dd = today.getDate();
// //         const hh = today.getHours();
// //         const start = yyyy + '-' + mn + "-" + dd + " " + hh + ":00:00";
// //         const finish = yyyy + '-' + mn + "-" + dd + " " + hh + ":59:59";
// //         // const hourBegin = new Date(start);
// //         // const hourFinish = new Date(finish);
// //
// //         let request = s350.request();
// //         request.input("startTs", sql.DateTime, start);
// //         request.input("finishTS", sql.DateTime, finish);
// //         let result = request.query(s350Queries.getProfiles).catch(e =>console.log(e));
// //         console.log(result);
// //         if (result.length > 0) {
// //             for(let row of result) {
// //                 data[row].Profile = row.Size;
// //                 data[row].Weight = row.Weight;
// //                 data[row].StartTs = row.StartTs;
// //                 data[row].FinishTs = row.FinishTs;
// //             }
// //         }
// //
// //         return data;
// //     }
// // }
//
// module.exports = testModel;
