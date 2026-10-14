import os
import sys
import logging
import boto3
from botocore.exceptions import ClientError
import json

logger = logging.getLogger()
# logger.setLevel(logging.DEBUG)

def format_terraform_value(value):
    """
    Formata valores Python para sintaxe Terraform
    """
    if isinstance(value, bool):
        return "true" if value else "false"
    elif isinstance(value, (int, float)):
        return str(value)
    elif isinstance(value, str):
        # Escapa aspas duplas e quebras de linha
        escaped = value.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')
        return f'"{escaped}"'
    elif isinstance(value, list):
        # Formata lista
        if not value:
            return "[]"
        formatted_items = [format_terraform_value(item) for item in value]
        return "[" + ", ".join(formatted_items) + "]"
    elif isinstance(value, dict):
        # Formata objeto/map — sem vírgulas entre atributos (sintaxe HCL)
        if not value:
            return "{}"
        formatted_items = [f'{key} = {format_terraform_value(val)}' for key, val in value.items()]
        return "{\n    " + "\n    ".join(formatted_items) + "\n  }"
    elif value is None:
        return "null"
    else:
        # Fallback para string
        return f'"{str(value)}"'

def main() -> None:
    try: 
        print("Iniciando a criação do arquivo de variáveis")
        if len(sys.argv) < 3:
            print("Uso: python sdlf-parameters.py <app> <ambiente>")
            sys.exit(1)

        app = sys.argv[1]
        print(f"Aplicação: {app}")
        env = sys.argv[2]
        print(f"Ambiente recebido: {env}")

        file_name=r""+os.path.curdir+os.path.sep+env+".tfvars"
        file_object_to = open(file_name, "w")
    except:
        erro = r"Não foi possível criar o arquivo:"+file_name
        raise("Erro: "+erro)
    try:
        print("Acessando parâmetros no SSM Parameter Store")
        #recupera o parametro no ssm (se existir)
        ssm = boto3.client('ssm')
        parameter = ssm.get_parameter(Name=f'/{app}/sancho/{env}',WithDecryption=True)
        parameters=json.loads(parameter['Parameter']['Value'])
        for par in parameters:
            value = parameters[par]
            formatted_value = format_terraform_value(value)
            file_object_to.writelines(f'{par} = {formatted_value}\n')
    except ClientError as e:
        print( "Parâmetro: " + str(e))
    file_object_to.close()

if __name__ == "__main__":
    main()
