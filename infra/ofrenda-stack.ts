// El stack del altar.
//
// Ahora mismo está casi vacío a propósito: el backend lo escribes TÚ con el
// agente en el módulo 3. La tarea 1 de la spec (.kiro/specs/ofrenda/tasks.md)
// te dice qué construir aquí, y design.md cómo:
//
//   - una tabla de DynamoDB (partition key altarId, sort key sk)
//   - un bucket privado de S3 para las imágenes
//   - tres Lambdas en JavaScript plano (lambda/)
//   - una REST API con GET/POST /elements, POST /uploads y GET /uploads/{proxy+}
//
// Pídele al agente la tarea 1 y revisa el diff antes de desplegar.

import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'

export class OfrendaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // Tabla de DynamoDB para los elementos del altar
    const tabla = new cdk.aws_dynamodb.Table(this, 'Elementos', {
      tableName: 'ofrenda-elementos',
      partitionKey: { name: 'altarId', type: cdk.aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: cdk.aws_dynamodb.AttributeType.STRING },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    // Bucket privado de S3 para las imágenes
    const bucket = new cdk.aws_s3.Bucket(this, 'Imagenes', {
      bucketName: `ofrenda-imagenes-${cdk.Aws.ACCOUNT_ID}`,
      blockPublicAccess: cdk.aws_s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [cdk.aws_s3.HttpMethods.PUT],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
    })

    // Lambda para listar elementos
    const listar = new cdk.aws_lambda.Function(this, 'Listar', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      handler: 'listar.handler',
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      environment: {
        TABLA: tabla.tableName,
      },
    })
    tabla.grantReadData(listar)

    // Lambda para agregar/borrar elementos
    const agregar = new cdk.aws_lambda.Function(this, 'Agregar', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      handler: 'agregar.handler',
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      environment: {
        TABLA: tabla.tableName,
      },
    })
    tabla.grantReadWriteData(agregar)

    // Lambda para firmar URLs de S3
    const subir = new cdk.aws_lambda.Function(this, 'Subir', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_24_X,
      handler: 'subir.handler',
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      environment: {
        BUCKET: bucket.bucketName,
      },
    })
    bucket.grantPut(subir)
    bucket.grantRead(subir)

    // REST API con CORS
    const api = new cdk.aws_apigateway.RestApi(this, 'Api', {
      restApiName: 'ofrenda-api',
      defaultCorsPreflightOptions: {
        allowOrigins: cdk.aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST'],
        allowHeaders: ['Content-Type'],
      },
      deployOptions: {
        stageName: 'v1',
      },
    })

    // Rutas de la API
    const elements = api.root.addResource('elements')
    elements.addMethod('GET', new cdk.aws_apigateway.LambdaIntegration(listar))
    elements.addMethod('POST', new cdk.aws_apigateway.LambdaIntegration(agregar))

    const uploads = api.root.addResource('uploads')
    uploads.addMethod('POST', new cdk.aws_apigateway.LambdaIntegration(subir))
    
    const uploadsProxy = uploads.addResource('{proxy+}')
    uploadsProxy.addMethod('GET', new cdk.aws_apigateway.LambdaIntegration(subir))

    // Output con la URL de la API
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'URL de la API REST',
    })
  }
}
